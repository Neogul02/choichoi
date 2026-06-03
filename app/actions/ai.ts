'use server';

import axios from 'axios';
import { extractErrorMessage } from './_base';
import type { ApiResponse } from '@/types/api';

interface SalesAnalysisInput {
  totalRevenue: number;
  totalOrders: number;
  hourlyData: Array<{ label: string; revenue: number; orderCount: number }>;
  menuBreakdown: Array<{ name: string; totalQuantity: number; totalRevenue: number }>;
}

export async function fetchAISalesAnalysis(input: SalesAnalysisInput): Promise<ApiResponse<string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: 'API 키가 설정되지 않았습니다.' };

  const { totalRevenue, totalOrders, hourlyData, menuBreakdown } = input;
  const peakHour = hourlyData.reduce((max, d) => (d.revenue > max.revenue ? d : max), hourlyData[0]);
  const activeHours = hourlyData.filter((d) => d.revenue > 0);
  const menuList = menuBreakdown.map((m) => `  - ${m.name}: ${m.totalQuantity}개 / ₩${m.totalRevenue.toLocaleString()}`).join('\n');
  const hourList = activeHours.map((h) => `  - ${h.label}: 주문 ${h.orderCount}건 / ₩${h.revenue.toLocaleString()}`).join('\n');

  const prompt = `당신은 베이커리 POS 시스템의 전문 데이터 분석가입니다.
아래 제공된 판매 데이터를 바탕으로 지정된 포맷에 맞춰 매출 분석 리포트를 작성하세요.

[데이터]
- 총 매출: ₩${totalRevenue.toLocaleString()}
- 총 주문: ${totalOrders}건
- 피크 시간대: ${peakHour.label} (₩${peakHour.revenue.toLocaleString()})
- 시간대별 매출:
${hourList || '  - 데이터 없음'}
- 메뉴별 판매:
${menuList || '  - 데이터 없음'}

[제약 조건]
1. 반드시 아래의 [출력 포맷]을 그대로 사용하여 마크다운으로 출력할 것.
2. 각 항목은 1~2문장으로 간결하게 작성할 것.
3. 제공된 데이터 내에서만 분석하고, 근거 없는 추측은 배제할 것.
4. 인사말이나 부연 설명 없이 지정된 포맷의 텍스트만 출력할 것.

[출력 포맷]
- 💰 전체 흐름: (총 매출과 주문 건수를 바탕으로 한 전반적인 실적 요약)
- 📈 피크 타임: (피크 시간대와 해당 시간대 매출 집중도 분석)
- 🥐 인기 메뉴: (가장 많이 팔린 메뉴와 매출 기여도 분석)
- 💡 개선 제안: (데이터에 기반한 시간대별 인력 배치 또는 재고 준비 관련 실질적 액션 아이템)
`;

  try {
    const { data } = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'X-goog-api-key': apiKey } }
    );
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) return { success: false, error: '응답을 받지 못했습니다.' };
    return { success: true, data: text };
  } catch (e) {
    if (axios.isAxiosError(e)) {
      if (e.response?.status === 429) return { success: false, error: 'API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' };
      return { success: false, error: `Gemini 오류: ${e.response?.status} ${e.response?.data?.error?.message ?? ''}` };
    }
    return { success: false, error: extractErrorMessage(e) };
  }
}
