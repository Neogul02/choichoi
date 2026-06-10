'use client'

import NavBar from '@/components/NavBar'
import SalesBanner from '@/components/SalesBanner'
import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { fetchMenuItems } from '@/app/actions/menu';
import { saveOrder, fetchTodaysOrdersWithItems, fetchTodaysSales } from '@/app/actions/orders'
import type { MenuItem } from '@/types/database'
import { supabase, type OrderItemInput } from '@/lib/supabase'
import type {
  SaveOrderResponse,
  OrderRecordWithItems,
  TodaysSales,
} from '@/types/api'
import {
  formatPrice,
  formatKSTTime,
  getShortcutBadgeColors,
  hexWithAlpha,
} from '@/lib/utils'

function fireConfetti() {
  const colors = [
    '#f43f5e',
    '#fb7185',
    '#fda4af',
    '#fbbf24',
    '#34d399',
    '#60a5fa',
    '#a78bfa',
  ]
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { x: 0.5, y: 0.55 },
    colors,
    startVelocity: 42,
    gravity: 1.1,
    ticks: 100,
    scalar: 1.1,
  })
  setTimeout(() => {
    confetti({
      particleCount: 55,
      spread: 58,
      origin: { x: 0.18, y: 0.62 },
      angle: 65,
      colors,
      startVelocity: 36,
      gravity: 1.1,
      ticks: 80,
    })
    confetti({
      particleCount: 55,
      spread: 58,
      origin: { x: 0.82, y: 0.62 },
      angle: 115,
      colors,
      startVelocity: 36,
      gravity: 1.1,
      ticks: 80,
    })
  }, 110)
  setTimeout(() => {
    confetti({
      particleCount: 35,
      spread: 100,
      origin: { x: 0.5, y: 0.48 },
      colors,
      startVelocity: 22,
      gravity: 0.75,
      ticks: 70,
      scalar: 0.85,
    })
  }, 240)
}

const CASHIER_NAME_KEY = 'choichoi_cashier_name'

const cartItemVariants: Variants = {
  hidden: { opacity: 0, height: 0, marginBottom: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } },
}

export default function PosPage() {
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [todaySales, setTodaySales] = useState<TodaysSales>({
    totalRevenue: 0,
    totalOrders: 0,
  })
  const [flashKey, setFlashKey] = useState(0)
  const [lastPayment, setLastPayment] = useState<{
    amount: number
    id: number
  } | null>(null)
  const [cashierName, setCashierName] = useState<string | null>(null)
  const [popupId, setPopupId] = useState('0')
  const lastPaymentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCashierName(localStorage.getItem(CASHIER_NAME_KEY))
    setPopupId(localStorage.getItem('choichoi_popup_id') ?? '0')
  }, [])

  const queryClient = useQueryClient()

  useEffect(() => {
    if (popupId === '0') return () => {}
    const channel = supabase
      .channel(`orders-${popupId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] })
          queryClient.invalidateQueries({ queryKey: ['today-sales'] })
          queryClient.invalidateQueries({ queryKey: ['pending-orders'] })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pending-orders'] })
          queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, popupId])

  const checkoutFnRef = useRef<(() => void) | null>(null)
  const checkoutDebouncingRef = useRef(false)
  const displayChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  )
  const countsRef = useRef<Record<number, number>>({})
  const menuItemsRef = useRef<MenuItem[]>([])

  useEffect(() => {
    if (popupId === '0') return () => {}
    const ch = supabase
      .channel(`cart-display-${popupId}`)
      .on('broadcast', { event: 'customer_update' }, ({ payload }) => {
        const { itemId, delta } = payload as { itemId: number; delta: number }
        setCounts((prev) => ({
          ...prev,
          [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta),
        }))
      })
      .on('broadcast', { event: 'request_sync' }, () => {
        const c = countsRef.current
        const m = menuItemsRef.current
        const items = m
          .filter((item) => (c[item.id] ?? 0) > 0)
          .map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price,
            count: c[item.id] ?? 0,
            color: item.color,
          }))
        const total = m.reduce(
          (sum, item) => sum + item.price * (c[item.id] ?? 0),
          0,
        )
        displayChannelRef.current?.send({
          type: 'broadcast',
          event: 'cart_update',
          payload: { items, totalPrice: total },
        })
      })
    ch.subscribe()
    displayChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
    }
  }, [popupId])

  const salesQuery = useQuery<TodaysSales>({
    queryKey: ['today-sales'],
    queryFn: async () => {
      const result = await fetchTodaysSales()
      if (!result.success) throw new Error(result.error || '매출 로딩 실패')
      return result.data ?? { totalRevenue: 0, totalOrders: 0 }
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (salesQuery.data) setTodaySales(salesQuery.data)
  }, [salesQuery.data])

  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ['menu-items'],
    queryFn: async () => {
      const result = await fetchMenuItems()
      if (!result.success) throw new Error(result.error || '메뉴 로딩 실패')
      return result.data ?? []
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  })

  const menuItems = useMemo(() => menuQuery.data ?? [], [menuQuery.data])

  useEffect(() => {
    countsRef.current = counts
  }, [counts])
  useEffect(() => {
    menuItemsRef.current = menuItems
  }, [menuItems])

  const recentOrdersQuery = useQuery<OrderRecordWithItems[]>({
    queryKey: ['today-orders-recent'],
    queryFn: async () => {
      const result = await fetchTodaysOrdersWithItems(10)
      if (!result.success)
        throw new Error(result.error || '최근 주문 로딩 실패')
      return result.data ?? []
    },
    staleTime: 30_000,
  })
  const recentOrders = useMemo(
    () => (recentOrdersQuery.data ?? []).slice(0, 5),
    [recentOrdersQuery.data],
  )

  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  )

  const totalPrice = useMemo(
    () =>
      menuItems.reduce(
        (sum, item) => sum + item.price * (counts[item.id] ?? 0),
        0,
      ),
    [counts, menuItems],
  )

  const orderedItems = useMemo(
    () => menuItems.filter((item) => (counts[item.id] ?? 0) > 0),
    [counts, menuItems],
  )

  useEffect(() => {
    const ch = displayChannelRef.current
    if (!ch) return
    const items = menuItems
      .filter((item) => (counts[item.id] ?? 0) > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        count: counts[item.id] ?? 0,
        color: item.color,
      }))
    ch.send({
      type: 'broadcast',
      event: 'cart_update',
      payload: { items, totalPrice },
    })
  }, [counts, menuItems, totalPrice])

  const increase = useCallback(
    (id: number) =>
      setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 })),
    [],
  )

  const decrease = useCallback(
    (id: number) =>
      setCounts((prev) => ({
        ...prev,
        [id]: Math.max(0, (prev[id] ?? 0) - 1),
      })),
    [],
  )

  const resetOrder = useCallback(() => {
    setCounts({})
    displayChannelRef.current?.send({
      type: 'broadcast',
      event: 'cart_reset',
      payload: {},
    })
  }, [])

  const checkoutMutation = useMutation<
    SaveOrderResponse,
    Error,
    { items: OrderItemInput[]; totalPrice: number; cashierName?: string },
    { previousCounts: Record<number, number> }
  >({
    mutationFn: ({ items, totalPrice, cashierName: name }) =>
      saveOrder(items, totalPrice, name ?? undefined),
    onMutate: () => {
      const previousCounts = { ...counts }
      resetOrder()
      return { previousCounts }
    },
    onSuccess: (result, vars, context) => {
      if (result.success) {
        displayChannelRef.current?.send({
          type: 'broadcast',
          event: 'checkout_complete',
          payload: {
            items: vars.items.map((item) => ({
              ...item,
              color: menuItems.find((m) => m.id === item.id)?.color,
            })),
            totalPrice: vars.totalPrice,
          },
        })

        const label = result.dailyOrderNumber
          ? `오늘 ${result.dailyOrderNumber}번째 주문`
          : `주문번호: ${result.orderId}`
        toast.success(`결제 완료! ${label}`, { id: 'checkout-success' })
        if (result.inventoryError) toast.error(`재고 차감 실패: ${result.inventoryError}`)

        if (result.sales) setTodaySales(result.sales)
        setFlashKey((k) => k + 1)

        if (lastPaymentTimerRef.current)
          clearTimeout(lastPaymentTimerRef.current)
        setLastPayment({ amount: vars.totalPrice, id: Date.now() })
        lastPaymentTimerRef.current = setTimeout(
          () => setLastPayment(null),
          1200,
        )

        fireConfetti()
        queryClient.invalidateQueries({ queryKey: ['today-orders-recent'] })
      } else {
        if (context?.previousCounts) setCounts(context.previousCounts)
        toast.error(result.error || '결제 오류가 발생했습니다')
      }
    },
    onError: (_error, _vars, context) => {
      if (context?.previousCounts) setCounts(context.previousCounts)
      toast.error('네트워크 오류로 결제가 취소되었습니다')
    },
  })

  const handleCheckout = () => {
    if (checkoutMutation.isPending) return
    if (totalPrice === 0) {
      toast.warning('주문하신 항목이 없습니다')
      return
    }
    const items = menuItems
      .filter((item) => counts[item.id] > 0)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        count: counts[item.id],
      }))
    checkoutMutation.mutate({
      items,
      totalPrice,
      cashierName: cashierName ?? undefined,
    })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      const isTyping =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable)
      if (isTyping) return

      if (event.key === 'Escape') {
        event.preventDefault()
        resetOrder()
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (checkoutDebouncingRef.current) return
        checkoutDebouncingRef.current = true
        setTimeout(() => {
          checkoutDebouncingRef.current = false
        }, 2000)
        checkoutFnRef.current?.()
        return
      }

      if (/^[1-9]$/.test(event.key)) {
        const targetItem = menuItems[Number(event.key) - 1]
        if (!targetItem) return
        event.preventDefault()
        increase(targetItem.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuItems, resetOrder, increase])

  useEffect(() => {
    checkoutFnRef.current = handleCheckout
  })

  return (
    <>
      <NavBar />

      <main className="min-h-screen p-3 md:p-5 pb-24 md:pb-5 md:px-8 max-w-[1100px] mx-auto">
        {/* 결제 대기 헤더 */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="bg-canvas mt-[-10px] rounded-xl p-3 md:p-4 mb-2 md:mb-3 shadow-level-1 border border-hairline"
        >
          <div className="rounded-xl p-3 bg-[#fff5f5] border-2 border-rose-500 mb-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.04em] px-2 py-0.5 rounded-full bg-rose-500 text-white">
                  결제 대기
                </span>
                <span className="text-[11px] font-semibold text-ink-faint">
                  {totalCount}개
                </span>
              </div>
              <button
                className="text-[11px] font-bold text-rose-400 border border-rose-200 rounded-lg px-2 py-0.5 bg-canvas cursor-pointer transition-all duration-200 hover:bg-rose-50 active:scale-95"
                onClick={resetOrder}
              >
                초기화
              </button>
            </div>
            <motion.div
              key={totalPrice}
              initial={{ scale: 1.04 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className="text-[clamp(22px,6vw,36px)] font-black text-rose-500 leading-[1.1]"
            >
              {formatPrice(totalPrice)}원
            </motion.div>
          </div>
        </motion.header>

        <div>
          {/* 메뉴 그리드 */}
          <section
            className="grid grid-cols-2 gap-2 md:gap-2.5 mb-4"
            aria-label="메뉴 목록"
          >
            {menuQuery.isLoading && menuItems.length === 0 && (
              <p className="m-0 text-ink-faint text-sm">
                메뉴를 불러오는 중입니다...
              </p>
            )}
            {menuItems.map((item, index) => {
              const count = counts[item.id] ?? 0
              const shortcutNumber = index + 1
              const hasShortcut = shortcutNumber <= 9
              const badgeStyle = getShortcutBadgeColors(item.color)
              return (
                <motion.article
                  key={item.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => increase(item.id)}
                  className={`relative rounded-xl p-3 md:p-3.5 transition-shadow duration-200 cursor-pointer ${
                    count > 0
                      ? 'shadow-none'
                      : 'bg-canvas shadow-level-1 hover:shadow-level-2'
                  }`}
                  style={
                    count > 0
                      ? {
                          backgroundColor: hexWithAlpha(item.color, 0.18),
                          boxShadow: `0 0 0 3px ${hexWithAlpha(item.color, 0.65)}`,
                        }
                      : {}
                  }
                >
                  {hasShortcut && (
                    <strong
                      className="absolute top-2 right-2 md:right-2.5 min-w-[28px] h-[28px] px-2 rounded-full border border-black/15 text-base font-black leading-[28px] text-center z-10 shadow-[0_1px_4px_rgba(0,0,0,0.16)]"
                      style={badgeStyle}
                      aria-label={`${item.name} 단축키 ${shortcutNumber}번`}
                    >
                      {shortcutNumber}
                    </strong>
                  )}
                  <div className="w-full text-left mb-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span
                        className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shrink-0 border-2 border-black/10"
                        style={{ backgroundColor: item.color }}
                      />
                      <h2 className="m-0 text-sm md:text-base font-bold leading-snug">
                        {item.name}
                      </h2>
                    </div>
                    <p className="m-0 text-xl md:text-2xl font-extrabold text-ink-secondary">
                      {formatPrice(item.price)}원
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-hairline text-xl md:text-2xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] hover:border-ink-faint active:scale-95 leading-none"
                      onClick={(e) => {
                        e.stopPropagation()
                        decrease(item.id)
                      }}
                      aria-label={`${item.name} 수량 감소`}
                    >
                      −
                    </button>
                    <motion.strong
                      key={count}
                      initial={{ scale: 1.25 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: 'spring',
                        stiffness: 320,
                        damping: 16,
                      }}
                      className={`flex-1 text-base md:text-lg font-bold text-center ${count > 0 ? 'text-primary-700' : 'text-ink-secondary'}`}
                    >
                      {count}개
                    </motion.strong>
                    <button
                      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-lg border border-hairline text-xl md:text-2xl font-semibold cursor-pointer bg-canvas-soft transition-all duration-200 hover:bg-[#ececeb] hover:border-ink-faint active:scale-95 leading-none"
                      onClick={(e) => {
                        e.stopPropagation()
                        increase(item.id)
                      }}
                      aria-label={`${item.name} 수량 증가`}
                    >
                      +
                    </button>
                  </div>
                </motion.article>
              )
            })}
          </section>

          {/* 주문 상세 */}
          <section
            className="bg-canvas rounded-xl p-3 shadow-level-1 mb-3"
            aria-label="주문 상세"
          >
            <h2 className="m-0 mb-2 text-sm md:text-base font-bold">
              주문 상세
            </h2>
            {orderedItems.length === 0 ? (
              <p className="m-0 text-ink-faint text-sm">
                {checkoutMutation.isPending
                  ? '결제 처리 중...'
                  : '선택한 메뉴가 없습니다.'}
              </p>
            ) : (
              <ul className="m-0 p-0 list-none overflow-hidden">
                <AnimatePresence initial={false}>
                  {orderedItems.map((item, index) => {
                    const count = counts[item.id]
                    return (
                      <motion.li
                        key={item.id}
                        variants={cartItemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className={`flex justify-between items-center py-2.5 text-sm ${index !== orderedItems.length - 1 ? 'border-b border-hairline' : ''}`}
                      >
                        <span>
                          {item.name} × {count}
                        </span>
                        <strong className="font-bold text-primary-700">
                          {formatPrice(item.price * count)}원
                        </strong>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}

            <button
              className="hidden md:block w-full p-3 mt-3 text-base font-bold bg-primary-700 text-white border-none rounded-lg cursor-pointer transition-all duration-200 hover:bg-primary-800 hover:-translate-y-0.5 active:scale-[0.98] disabled:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#ccc] disabled:hover:translate-y-0"
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || orderedItems.length === 0}
            >
              {checkoutMutation.isPending ? '처리 중...' : '결제하기'}
            </button>
          </section>

          {/* 최근 주문 */}
          <section
            className="bg-canvas rounded-xl mb-4 p-3.5 md:p-4 shadow-level-1 border border-hairline"
            aria-label="최근 주문"
          >
            <h2 className="m-0 mb-3 text-base md:text-lg font-bold text-ink-secondary">
              최근 주문
            </h2>
            {recentOrdersQuery.isLoading ? (
              <p className="m-0 text-ink-faint text-sm">불러오는 중...</p>
            ) : recentOrders.length === 0 ? (
              <p className="m-0 text-ink-faint text-sm">
                오늘 주문 내역이 없습니다.
              </p>
            ) : (
              <ul className="m-0 p-0 list-none">
                {recentOrders.map((order, index) => (
                  <li
                    key={order.id}
                    className={`py-2.5 ${index !== recentOrders.length - 1 ? 'border-b border-hairline' : ''}`}
                  >
                    <div className="flex justify-between items-center mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-muted text-xs font-medium">
                          {formatKSTTime(order.created_at)}
                        </span>
                        {order.cashier_name && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-canvas-soft text-ink-muted">
                            {order.cashier_name}
                          </span>
                        )}
                      </div>
                      <strong className="text-sm font-bold text-primary-700">
                        {formatPrice(order.total_price)}원
                      </strong>
                    </div>
                    <p className="m-0 text-ink-muted text-xs truncate">
                      {order.items.length > 0
                        ? order.items
                            .map((item) => `${item.name} × ${item.quantity}`)
                            .join(', ')
                        : '-'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 모바일 전용 sticky 결제 바 */}
          <div className="md:hidden sticky bottom-0 left-0 right-0 z-30 -mx-3">
            <div className="absolute -top-6 inset-x-0 h-6 bg-gradient-to-t from-canvas-soft to-transparent pointer-events-none" />
            <div className="px-3 pb-3 pt-3 bg-canvas-soft">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending || orderedItems.length === 0}
                className="w-full px-5 py-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(8,68,49,0.4)] transition active:scale-[0.99] disabled:bg-[#ccc] disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2.5">
                  <span className="min-w-7 h-7 px-2 rounded-full bg-canvas/20 text-xs font-black flex items-center justify-center tabular-nums">
                    {totalCount}개
                  </span>
                  <span className="text-base">
                    {checkoutMutation.isPending ? '처리 중...' : '결제하기'}
                  </span>
                </span>
                <span className="text-lg font-black tabular-nums">
                  {formatPrice(totalPrice)}원
                </span>
              </button>
            </div>
          </div>
        </div>

        <SalesBanner
          totalRevenue={todaySales.totalRevenue}
          totalOrders={todaySales.totalOrders}
          flashKey={flashKey}
          lastPayment={lastPayment}
        />
      </main>
    </>
  )
}
