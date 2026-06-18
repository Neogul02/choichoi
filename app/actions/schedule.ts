'use server';

import { z } from 'zod';
import { wrap } from './_base';
import {
  getPopupEvents,
  createPopupEvent,
  deletePopupEvent,
  updatePopupEvent,
  getScheduleByEvent,
  addScheduleSlot,
  removeScheduleSlot,
  moveScheduleSlot,
  updateScheduleSlot,
  copyScheduleSlot,
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  setWorkerPaymentDone,
} from '@/lib/supabase-admin';
import type { WorkerInput } from '@/lib/supabase';
import type {
  ApiResponse,
  FetchEventsResponse,
  FetchSlotsResponse,
  FetchWorkersResponse,
} from '@/types/api';
import type { PopupEvent, ScheduleSlot, Worker } from '@/types/database';

const PopupEventSchema = z.object({
  name: z.string().min(1, '행사명을 입력해주세요').max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식이 올바르지 않습니다'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식이 올바르지 않습니다'),
});

// ── Popup Events ──────────────────────────────────────────────────────────────

export async function fetchPopupEvents(): Promise<FetchEventsResponse> { return wrap(getPopupEvents); }

export async function createNewPopupEvent(name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => createPopupEvent(parsed.data.name, parsed.data.startDate, parsed.data.endDate));
}

export async function removePopupEvent(id: number): Promise<ApiResponse> { return wrap(() => deletePopupEvent(id)); }

export async function editPopupEvent(id: number, name: string, startDate: string, endDate: string): Promise<ApiResponse<PopupEvent>> {
  const parsed = PopupEventSchema.safeParse({ name, startDate, endDate });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return wrap(() => updatePopupEvent(id, parsed.data.name, parsed.data.startDate, parsed.data.endDate));
}

// ── Schedule Slots ────────────────────────────────────────────────────────────

export async function fetchScheduleByEvent(eventId: number): Promise<FetchSlotsResponse> { return wrap(() => getScheduleByEvent(eventId)); }
export async function addScheduleEntry(eventId: number, scheduleDate: string, role: string, personName: string, workTime: string, workerId?: number, breakTime?: number): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => addScheduleSlot(eventId, scheduleDate, role, personName, workTime, workerId, breakTime)); }
export async function removeScheduleEntry(id: number): Promise<ApiResponse> { return wrap(() => removeScheduleSlot(id)); }
export async function moveScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => moveScheduleSlot(id, newDate, newRole)); }
export async function editScheduleEntry(id: number, personName: string, workTime: string, workerId?: number | null, breakTime?: number): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => updateScheduleSlot(id, personName, workTime, workerId, breakTime)); }
export async function copyScheduleEntry(id: number, newDate: string, newRole: string): Promise<ApiResponse<ScheduleSlot>> { return wrap(() => copyScheduleSlot(id, newDate, newRole)); }

// ── Workers ───────────────────────────────────────────────────────────────────

export async function fetchWorkers(eventId: number): Promise<FetchWorkersResponse> { return wrap(() => getWorkers(eventId)); }
export async function createNewWorker(input: WorkerInput): Promise<ApiResponse<Worker>> { return wrap(() => createWorker(input)); }
export async function editWorker(id: number, input: WorkerInput): Promise<ApiResponse<Worker>> { return wrap(() => updateWorker(id, input)); }
export async function removeWorker(id: number): Promise<ApiResponse> { return wrap(() => deleteWorker(id)); }
export async function markWorkerPayment(id: number, done: boolean): Promise<ApiResponse<Worker>> { return wrap(() => setWorkerPaymentDone(id, done)); }
