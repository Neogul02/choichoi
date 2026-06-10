import { toast } from 'sonner'

export function showMsg(msg: string) {
  const isError =
    msg.startsWith('오류') ||
    msg.endsWith('하세요') ||
    msg.includes('앞입니다') ||
    msg.includes('찾을 수 없습니다')
  if (isError) toast.error(msg)
  else toast.success(msg)
}
