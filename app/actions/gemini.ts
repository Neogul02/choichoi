'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DailySalesItem, MenuSalesItem } from '@/types/api';

export async function analyzePopupSales(
  popupName: string,
  startDate: string,
  endDate: string,
  dailySales: DailySalesItem[],
  menuBreakdown: MenuSalesItem[],
): Promise<{ success: boolean; data?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: 'GEMINI_API_KEY가 설정되지 않았습니다.' };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const today = new Date().toISOString().slice(0, 10);
  const isOngoing = today >= startDate && today <= endDate;
  const totalDays = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
  const elapsedDays = dailySales.length;
  const remainingDays = Math.max(0, Math.round((new Date(endDate).getTime() - new Date(today).getTime()) / 86400000));
  const totalRevenue = dailySales.reduce((s, d) => s + d.revenue, 0);
  const totalOrders = dailySales.reduce((s, d) => s + d.orderCount, 0);
  const avgDaily = elapsedDays > 0 ? Math.round(totalRevenue / elapsedDays) : 0;

  const dataSection = `
[팝업 기본 정보]
- 팝업명: ${popupName}
- 운영 기간: ${startDate} ~ ${endDate} (총 ${totalDays}일)
- 현재 상태: ${isOngoing ? `진행중 (경과 ${elapsedDays}일, 잔여 ${remainingDays}일)` : '종료'}
- 오늘 날짜: ${today}

[매출 요약]
- 총 매출: ${totalRevenue.toLocaleString('ko-KR')}원
- 총 주문: ${totalOrders}건
- 평균 객단가: ${totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toLocaleString('ko-KR') : 0}원
- 일평균 매출: ${avgDaily.toLocaleString('ko-KR')}원

[일별 매출]
${dailySales.map((d) => `${d.date}: ${d.revenue.toLocaleString('ko-KR')}원, ${d.orderCount}건`).join('\n')}

[메뉴별 판매 (판매량순)]
${menuBreakdown.map((m) => `${m.name}: ${m.totalQuantity}개, ${m.totalRevenue.toLocaleString('ko-KR')}원`).join('\n')}
`.trim();

  const ongoingPrompt = `
당신은 팝업 스토어 매출 전략 컨설턴트입니다.

${dataSection}

팝업명("${popupName}")에서 운영 지역을 추론하고, 해당 상권의 유동인구 특성·소비 패턴을 근거로 아래 항목을 한국어로 분석해 주세요.

■ 1. 현재까지 성과 평가
지금까지의 매출·주문 흐름을 평가하고, 일평균 대비 좋은 날/부진한 날의 원인을 분석하세요.

■ 2. 지역 상권 분석 및 예측
팝업 운영 지역의 상권 특성(유동인구 패턴, 주요 고객층, 소비 성향)을 바탕으로 잔여 ${remainingDays}일 동안의 매출 흐름을 예측하세요. 예상 총 매출도 범위로 제시해 주세요.

■ 3. 남은 기간 매출 극대화 전략
지금 당장 실행 가능한 운영 개선안 3가지를 구체적으로 제시하세요. (메뉴 구성, 운영 시간, 마케팅 등)

■ 4. 주의해야 할 리스크
남은 기간 중 매출에 영향을 줄 수 있는 리스크 요인을 짚어주세요.

마크다운 없이 읽기 쉬운 단락과 번호 목록으로 작성하세요.
`.trim();

  const endedPrompt = `
당신은 팝업 스토어 매출 분석 및 기획 컨설턴트입니다.

${dataSection}

팝업명("${popupName}")에서 운영 지역을 추론하고, 해당 상권의 특성을 근거로 아래 항목을 한국어로 분석해 주세요.

■ 1. 전체 성과 종합 평가
총 매출·주문 성과를 객관적으로 평가하고, 일별 흐름의 특이점(피크일, 부진일)을 분석하세요.

■ 2. 지역 상권 분석
운영 지역의 상권 특성과 이번 팝업 결과를 연결하여 해석하세요. 지역 소비 패턴이 매출에 어떤 영향을 미쳤는지 분석하세요.

■ 3. 메뉴 전략 분석
인기 메뉴와 비인기 메뉴의 매출 기여도를 분석하고, 다음 팝업을 위한 메뉴 구성 조정안을 제안하세요.

■ 4. 다음 팝업 기획 제안
이번 운영 데이터와 지역 특성을 바탕으로 다음 팝업의 최적 운영 전략(기간, 시간대, 장소 선택 기준, 마케팅)을 3가지 이상 제안하세요.

마크다운 없이 읽기 쉬운 단락과 번호 목록으로 작성하세요.
`.trim();

  const prompt = isOngoing ? ongoingPrompt : endedPrompt;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return { success: true, data: result.response.text() };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const isRetryable = msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable');
      if (isRetryable && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      if (isRetryable) return { success: false, error: 'Gemini 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.' };
      return { success: false, error: msg || 'AI 분석 중 오류가 발생했습니다.' };
    }
  }
  return { success: false, error: 'AI 분석 중 오류가 발생했습니다.' };
}
