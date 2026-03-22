"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Plus, Users, Calendar, User, CalendarCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeSlot = string; // "day-hour"，例如 "0-9" = 週一 9am（以成員自身時區儲存）

type Member = {
  id: string;
  name: string;
  color: string;
  timezone: string; // [MODIFIED] 新增時區欄位，使用 IANA 時區格式，例如 "Asia/Taipei"
  availability: TimeSlot[]; // 以成員自身本地時區儲存的空閒時段
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["週一", "週二", "週三", "週四", "週五"];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const COLORS = [
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-red-500",
  "bg-yellow-500",
  "bg-cyan-500",
];

// [MODIFIED] 定義可供選擇的時區列表（IANA 格式），涵蓋全球主要城市
// 標籤中的 UTC 偏移量為標準時間偏移，夏令期間實際偏移會由程式動態計算
const TIMEZONES = [
  { label: "UTC-8  洛杉磯（太平洋時間）", value: "America/Los_Angeles" },
  { label: "UTC-7  丹佛（山地時間）", value: "America/Denver" },
  { label: "UTC-6  芝加哥（中部時間）", value: "America/Chicago" },
  { label: "UTC-5  紐約（東部時間）", value: "America/New_York" },
  { label: "UTC+0  倫敦", value: "Europe/London" },
  { label: "UTC+1  柏林 / 巴黎", value: "Europe/Berlin" },
  { label: "UTC+2  赫爾辛基", value: "Europe/Helsinki" },
  { label: "UTC+3  莫斯科", value: "Europe/Moscow" },
  { label: "UTC+5:30  印度", value: "Asia/Kolkata" },
  { label: "UTC+7  曼谷 / 河內", value: "Asia/Bangkok" },
  { label: "UTC+8  台北 / 香港 / 北京", value: "Asia/Taipei" },
  { label: "UTC+9  東京 / 首爾", value: "Asia/Tokyo" },
  { label: "UTC+10  雪梨", value: "Australia/Sydney" },
  { label: "UTC+12  奧克蘭", value: "Pacific/Auckland" },
];

const slot = (day: number, hour: number): TimeSlot => `${day}-${hour}`;

// ─── Timezone Utilities ───────────────────────────────────────────────────────

// [MODIFIED] 取得本週週一 UTC 零時的 Date 物件，作為時區換算的基準日期
// 使用當週真實日期（而非固定常數），確保夏令時間（DST）的偏移量計算正確
function getReferenceMondayUTC(): Date {
  const now = new Date();
  const utcDayOfWeek = now.getUTCDay(); // 取得 UTC 的星期幾：0=週日, 1=週一, …, 6=週六
  const daysFromMonday = utcDayOfWeek === 0 ? 6 : utcDayOfWeek - 1; // 計算距上一個週一的天數
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysFromMonday); // 退回到週一
  monday.setUTCHours(0, 0, 0, 0); // 設為 UTC 午夜
  return monday;
}

// [MODIFIED] 計算指定時區在某 UTC 時間點的偏移量（分鐘）
// 正值代表比 UTC 快（例如 Asia/Taipei = +480 分鐘），負值代表比 UTC 慢
// 利用瀏覽器內建的 Intl.DateTimeFormat API 自動處理夏令時間，無需維護任何 DST 規則表
function getTimezoneOffsetMinutes(tz: string, date: Date): number {
  // 使用 en-CA locale 格式化，輸出格式穩定（YYYY-MM-DD HH:MM:SS）便於解析
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,       // 指定要查詢的目標時區
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,      // 使用 24 小時制，避免 AM/PM 解析問題
  });
  // 將 formatToParts 結果轉為 { type: value } 的物件方便存取
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  // 解析各時間欄位；部分瀏覽器對午夜可能輸出 "24"，以 % 24 修正為 "0"
  const year = parseInt(parts.year);
  const month = parseInt(parts.month) - 1; // Date.UTC 月份從 0 開始
  const day = parseInt(parts.day);
  const hour = parseInt(parts.hour) % 24; // 修正 "24" 邊界值
  const minute = parseInt(parts.minute);
  const second = parseInt(parts.second);
  // 將本地時間各欄位視為 UTC 組合成毫秒時間戳，用於與真實 UTC 比較
  const localAsUtcMs = Date.UTC(year, month, day, hour, minute, second);
  // 偏移量（分鐘） = (本地時間毫秒 − UTC 毫秒) / 60000
  // [MODIFIED] 加上 Math.round 消除浮點誤差：真實時區偏移必為整數分鐘，
  // 不四捨五入時伺服器與客戶端因 new Date() 毫秒差異會產生不同浮點結果，導致 SSR hydration 錯誤
  return Math.round((localAsUtcMs - date.getTime()) / 60000);
}

// [MODIFIED] 將成員本地時區的時段（day: 0=週一, hour: 9–17）轉換為對應的 UTC 時段
// 若換算後 UTC 落在週末（週六或週日）則回傳 null，表示跨越本系統顯示邊界
function localSlotToUtcSlot(
  day: number,
  hour: number,
  tz: string
): { day: number; hour: number } | null {
  const refMonday = getReferenceMondayUTC();
  // 建立近似 UTC 時間：先把「本地 hour」填入 UTC 欄位作為偏移量計算的起始近似值
  const approxDate = new Date(refMonday);
  approxDate.setUTCDate(refMonday.getUTCDate() + day); // 移至對應的星期幾
  approxDate.setUTCHours(hour, 0, 0, 0);               // 填入近似小時
  // 取得該時區在此近似時間點的 UTC 偏移量（自動含 DST 調整）
  const offsetMin = getTimezoneOffsetMinutes(tz, approxDate);
  // 實際 UTC = 本地時間 − 偏移量（毫秒換算）
  const utcMs = approxDate.getTime() - offsetMin * 60000;
  const utcDate = new Date(utcMs);
  // 將 UTC 星期（0=週日）轉換為本系統使用的格式（0=週一）
  const utcDayOfWeek = utcDate.getUTCDay();
  const utcDay = utcDayOfWeek === 0 ? 6 : utcDayOfWeek - 1; // 0=週一…6=週日
  const utcHour = utcDate.getUTCHours();
  // 若 UTC 時段落在週末（index 5=週六, 6=週日）則此時段無法在系統顯示，回傳 null
  if (utcDay > 4) return null;
  return { day: utcDay, hour: utcHour };
}

// [MODIFIED] 將 UTC 時段轉換回指定時區的本地時段
// 若本地時段落在週末，或不在系統顯示範圍（HOURS 9–17）內，則回傳 null
function utcSlotToLocalSlot(
  day: number,
  hour: number,
  tz: string
): { day: number; hour: number } | null {
  const refMonday = getReferenceMondayUTC();
  // 建立精確的 UTC 時段 Date 物件
  const utcDate = new Date(refMonday);
  utcDate.setUTCDate(refMonday.getUTCDate() + day); // UTC 星期幾
  utcDate.setUTCHours(hour, 0, 0, 0);               // UTC 小時
  // 取得目標時區的偏移量（含 DST）
  const offsetMin = getTimezoneOffsetMinutes(tz, utcDate);
  // 本地時間 = UTC + 偏移量
  const localMs = utcDate.getTime() + offsetMin * 60000;
  const localDate = new Date(localMs);
  // 使用 getUTC* 讀取本地時間欄位（localDate 的 UTC 欄位即對應本地時間值）
  const localDayOfWeek = localDate.getUTCDay();
  const localDay = localDayOfWeek === 0 ? 6 : localDayOfWeek - 1; // 轉為 0=週一格式
  const localHour = localDate.getUTCHours();
  if (localDay > 4) return null;             // 落在週末，捨棄
  if (!HOURS.includes(localHour)) return null; // 超出系統顯示範圍，捨棄
  return { day: localDay, hour: localHour };
}

// [MODIFIED] 將某成員的本地 availability 全部轉換為 UTC 時段，供跨時區交集計算使用
function memberAvailabilityToUtc(member: Member): TimeSlot[] {
  const utcSlots: TimeSlot[] = [];
  for (const s of member.availability) {
    const [d, h] = s.split("-").map(Number);            // 解析本地時段
    const utc = localSlotToUtcSlot(d, h, member.timezone); // 轉換為 UTC
    if (utc) utcSlots.push(slot(utc.day, utc.hour));   // 過濾掉無法對應的時段
  }
  return utcSlots;
}

// [MODIFIED] 格式化時區為 UTC±H 或 UTC±H:MM 字串，動態反映當下夏令時間
function formatTimezoneOffset(tz: string): string {
  const offsetMin = getTimezoneOffsetMinutes(tz, new Date()); // 以當前時間計算，DST 自動反映
  const sign = offsetMin >= 0 ? "+" : "-";                   // 正負號
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);                            // 小時部分
  const m = abs % 60;                                        // 分鐘部分（如印度 +5:30）
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

// ─── Fake initial data ────────────────────────────────────────────────────────

// 假資料：三人皆有「週三 9–11」共同空閒，方便展示
const INITIAL_MEMBERS: Member[] = [
  {
    id: "me",
    name: "我",
    color: "bg-blue-500",
    timezone: "Asia/Taipei", // [MODIFIED] 新增時區欄位，預設為台北（UTC+8）
    availability: [
      slot(0, 9), slot(0, 10), slot(0, 11),          // Mon 9–12
      slot(0, 14), slot(0, 15), slot(0, 16),         // Mon 14–17
      slot(2, 9),  slot(2, 10), slot(2, 11),         // Wed 9–12（共同）
      slot(3, 14), slot(3, 15), slot(3, 16),         // Thu 14–17
      slot(4, 9),  slot(4, 10),                      // Fri 9–11
    ],
  },
  {
    id: "xiao-liang",
    name: "小梁",
    color: "bg-green-500",
    timezone: "Asia/Taipei", // [MODIFIED] 新增時區欄位，預設為台北（UTC+8）
    availability: [
      slot(0, 9),  slot(0, 10), slot(0, 11),         // Mon 9–12
      slot(2, 9),  slot(2, 10), slot(2, 11),         // Wed 9–12（共同）
      slot(2, 14), slot(2, 15), slot(2, 16),         // Wed 14–17
      slot(4, 9),  slot(4, 10),                      // Fri 9–11
    ],
  },
  {
    id: "lu-lu",
    name: "盧盧",
    color: "bg-purple-500",
    timezone: "Asia/Taipei", // [MODIFIED] 新增時區欄位，預設為台北（UTC+8）
    availability: [
      slot(1, 10), slot(1, 11), slot(1, 12),         // Tue 10–13
      slot(2, 9),  slot(2, 10), slot(2, 11),         // Wed 9–12（共同）
      slot(3, 14), slot(3, 15),                      // Thu 14–16
    ],
  },
];

// ─── Schedule Grid Component ──────────────────────────────────────────────────

function ScheduleGrid({
  availability,
  onToggle,
  emerald = false,
}: {
  availability: TimeSlot[];
  onToggle?: (day: number, hour: number) => void;
  emerald?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="w-14" />
            {DAYS.map((d) => (
              <th key={d} className="p-2 text-center font-medium text-sm">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <td className="text-right pr-3 text-muted-foreground text-xs py-0.5 whitespace-nowrap">
                {h}:00
              </td>
              {DAYS.map((_, d) => {
                const s = slot(d, h);
                const active = availability.includes(s);
                const cellClass = active
                  ? emerald
                    ? "bg-emerald-400 border-emerald-400"
                    : "bg-primary border-primary"
                  : "bg-muted border-border hover:bg-muted/60";
                return (
                  <td key={d} className="p-0.5">
                    <div
                      className={`h-8 rounded border transition-colors ${cellClass} ${onToggle ? "cursor-pointer" : "cursor-default"}`}
                      onClick={() => onToggle?.(d, h)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex gap-4 mb-5 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded ${item.color}`} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

// [MODIFIED] 時區選擇下拉選單元件，使用 HTML 原生 <select> 並套用 Tailwind 樣式
function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  return (
    // [MODIFIED] 選單容器，flex 排列使標籤與下拉並排
    <div className="flex items-center gap-2">
      {/* [MODIFIED] 時區標籤文字 */}
      <span className="text-sm text-muted-foreground whitespace-nowrap">時區：</span>
      {/* [MODIFIED] 原生 <select> 樣式化為與專案設計一致的外觀 */}
      <select
        className="text-sm border border-border rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}               // [MODIFIED] 受控元件，綁定當前時區值
        onChange={(e) => onChange(e.target.value)} // [MODIFIED] 選擇變更時呼叫回呼
      >
        {/* [MODIFIED] 依照 TIMEZONES 常數渲染每個時區選項 */}
        {TIMEZONES.map((tz) => (
          <option key={tz.value} value={tz.value}>
            {tz.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function MeetFlow() {
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [viewId, setViewId] = useState("xiao-liang");
  const [newTimezone, setNewTimezone] = useState("Asia/Taipei"); // [MODIFIED] 新增成員時選擇的時區狀態，預設台北

  const me = members.find((m) => m.id === "me")!;
  const others = members.filter((m) => m.id !== "me");
  const viewing = members.find((m) => m.id === viewId) ?? others[0];

  // [MODIFIED] 以 UTC 為中介計算共同空閒，支援跨時區成員
  // 步驟 1：將每位成員的本地 availability 全部轉換為 UTC 時段，建立 Set 供快速查找
  const memberUtcSets = members.map((m) => new Set(memberAvailabilityToUtc(m)));
  // 步驟 2：以第一位成員的 UTC 時段為基礎，篩選出全員皆空閒的 UTC 交集時段
  const utcCommonSlots: TimeSlot[] =
    memberUtcSets.length > 0
      ? [...memberUtcSets[0]].filter((s) =>
          memberUtcSets.every((set) => set.has(s)) // 每位成員的 UTC Set 都必須包含此時段
        )
      : [];
  // 步驟 3：將 UTC 共同時段逐一轉換回「我」的本地時區，供介面顯示
  // 超出顯示範圍（週末或 9–17 以外）的時段會被 utcSlotToLocalSlot 過濾掉
  const commonSlots: TimeSlot[] = utcCommonSlots.flatMap((s) => {
    const [d, h] = s.split("-").map(Number);
    const local = utcSlotToLocalSlot(d, h, me.timezone); // 轉換為「我」的本地時段
    return local ? [slot(local.day, local.hour)] : [];   // 無效時段回傳空陣列（flatMap 自動省略）
  });

  function toggleMySlot(day: number, hour: number) {
    const s = slot(day, hour);
    setMembers((prev) =>
      prev.map((m) =>
        m.id !== "me"
          ? m
          : {
              ...m,
              availability: m.availability.includes(s)
                ? m.availability.filter((x) => x !== s)
                : [...m.availability, s],
            }
      )
    );
  }

  // [MODIFIED] 更新「我」的時區設定；availability 維持原有格網座標不變
  // （各成員的 availability 以自身時區儲存，換時區即代表重新定義那些格子的實際時間）
  function updateMyTimezone(tz: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === "me" ? { ...m, timezone: tz } : m))
    );
  }

  function addMember() {
    const name = newName.trim();
    if (!name) return;
    const color = COLORS[members.length % COLORS.length];
    const newMember: Member = {
      id: `member-${Date.now()}`,
      name,
      color,
      timezone: newTimezone, // [MODIFIED] 使用對話框中選擇的時區，而非寫死的固定值
      availability: [],
    };
    setMembers((prev) => [...prev, newMember]);
    setNewName("");
    setNewTimezone("Asia/Taipei"); // [MODIFIED] 加入後重設下次新增時的預設時區
    setOpen(false);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <CalendarCheck className="w-5 h-5" />
          <h1 className="text-lg font-semibold tracking-tight">MeetFlow</h1>
          <Badge variant="secondary" className="text-xs font-normal">
            Beta
          </Badge>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Tabs defaultValue="members">
          <TabsList className="mb-8 h-10">
            <TabsTrigger value="members" className="gap-1.5 text-sm">
              <Users className="w-3.5 h-3.5" />
              成員
            </TabsTrigger>
            <TabsTrigger value="my-schedule" className="gap-1.5 text-sm">
              <User className="w-3.5 h-3.5" />
              我的時間表
            </TabsTrigger>
            <TabsTrigger value="view-member" className="gap-1.5 text-sm">
              <Calendar className="w-3.5 h-3.5" />
              查看成員
            </TabsTrigger>
            <TabsTrigger value="common" className="gap-1.5 text-sm">
              <CalendarCheck className="w-3.5 h-3.5" />
              共同空閒
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Members ── */}
          <TabsContent value="members">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold">成員列表</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  共 {members.length} 位成員
                </p>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="w-4 h-4" />
                    加入成員
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xs">
                  <DialogHeader>
                    <DialogTitle>加入新成員</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 mt-2">
                    <Input
                      placeholder="輸入成員名稱"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addMember()}
                      autoFocus
                    />
                    {/* [MODIFIED] 在加入成員對話框中加入時區選擇，讓每位成員設定自己的時區 */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">成員時區</label>
                      {/* [MODIFIED] 對話框內的時區下拉選單，綁定 newTimezone 狀態 */}
                      <select
                        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full"
                        value={newTimezone}                              // [MODIFIED] 綁定新成員時區狀態
                        onChange={(e) => setNewTimezone(e.target.value)} // [MODIFIED] 更新新成員時區狀態
                      >
                        {/* [MODIFIED] 渲染所有時區選項 */}
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={addMember} disabled={!newName.trim()}>
                      確認加入
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((m) => (
                <Card key={m.id}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="w-10 h-10 shrink-0">
                      <AvatarFallback
                        className={`${m.color} text-white text-sm font-semibold`}
                      >
                        {m.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.name}</p>
                      {/* [MODIFIED] 在成員卡片中顯示時區與空閒時段數，方便一眼確認各成員時區 */}
                      <p className="text-xs text-muted-foreground">
                        {m.availability.length} 個空閒時段
                        {" · "}
                        {/* [MODIFIED] 動態顯示含夏令時間的實際 UTC 偏移量 */}
                        {formatTimezoneOffset(m.timezone)}
                      </p>
                    </div>
                    {m.id === "me" && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        你
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Tab 2: My Schedule ── */}
          <TabsContent value="my-schedule">
            <div className="mb-5">
              <h2 className="text-base font-semibold">我的時間表</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                點擊格子來切換你的空閒時段
              </p>
            </div>
            <Card>
              <CardContent className="pt-6">
                {/* [MODIFIED] 加入時區選擇器，讓使用者設定自己的本地時區 */}
                {/* 時區選擇放在圖例上方，改變時區後系統會重新換算共同空閒 */}
                <div className="flex items-center justify-between mb-4">
                  <Legend
                    items={[
                      { color: "bg-primary", label: "空閒" },
                      { color: "bg-muted border border-border", label: "忙碌" },
                    ]}
                  />
                  {/* [MODIFIED] 使用 TimezoneSelect 元件讓使用者選擇自己的時區 */}
                  <TimezoneSelect
                    value={me.timezone}          // [MODIFIED] 顯示「我」目前的時區
                    onChange={updateMyTimezone}  // [MODIFIED] 選擇後呼叫 updateMyTimezone 更新狀態
                  />
                </div>
                {/* [MODIFIED] 在時間表上方顯示目前選定時區名稱與當前 UTC 偏移，提示使用者 */}
                <p className="text-xs text-muted-foreground mb-3">
                  以下時間表以你的時區（
                  <span className="font-medium text-foreground">{me.timezone}</span>
                  {" / "}
                  {/* [MODIFIED] 動態計算並顯示含 DST 的實際偏移量 */}
                  <span className="font-medium text-foreground">{formatTimezoneOffset(me.timezone)}</span>
                  ）顯示，系統內部統一以 UTC 換算共同空閒
                </p>
                <ScheduleGrid
                  availability={me.availability}
                  onToggle={toggleMySlot}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab 3: View Member ── */}
          <TabsContent value="view-member">
            <div className="mb-5">
              <h2 className="text-base font-semibold">查看成員時間表</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                選擇成員來查看他們的空閒時段
              </p>
            </div>

            {others.length === 0 ? (
              <p className="text-muted-foreground text-sm py-12 text-center">
                尚無其他成員，請先在「成員」頁加入
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-5">
                  {others.map((m) => (
                    <Button
                      key={m.id}
                      variant={viewing?.id === m.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewId(m.id)}
                    >
                      {m.name}
                    </Button>
                  ))}
                </div>

                {viewing && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback
                            className={`${viewing.color} text-white text-xs font-semibold`}
                          >
                            {viewing.name[0]}
                          </AvatarFallback>
                        </Avatar>
                        {viewing.name} 的時間表
                        {/* [MODIFIED] 在成員時間表標題旁顯示該成員的時區資訊 */}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          （{viewing.timezone}
                          {" / "}
                          {/* [MODIFIED] 動態顯示該成員時區的含 DST 偏移量 */}
                          {formatTimezoneOffset(viewing.timezone)}）
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Legend
                        items={[
                          { color: "bg-primary", label: "空閒" },
                          {
                            color: "bg-muted border border-border",
                            label: "忙碌",
                          },
                        ]}
                      />
                      {/*
                        [MODIFIED] 將成員的時段從他們自身時區轉換至「我」的時區後顯示。
                        轉換流程：成員本地時區 → UTC → 我的本地時區。
                        使用與共同空閒相同的兩步驟換算（memberAvailabilityToUtc + utcSlotToLocalSlot），
                        確保跨時區與夏令時間（DST）都能正確處理。
                        落在週末或 9–17 顯示範圍外的時段會被自動過濾。
                      */}
                      {(() => {
                        // 步驟 1：將 viewing 成員的本地 availability 轉換為 UTC 時段
                        const viewingUtcSlots = memberAvailabilityToUtc(viewing);
                        // 步驟 2：將 UTC 時段逐一轉換為「我」的本地時區時段
                        const viewingInMyTz: TimeSlot[] = viewingUtcSlots.flatMap((s) => {
                          const [d, h] = s.split("-").map(Number);
                          const local = utcSlotToLocalSlot(d, h, me.timezone);
                          // utcSlotToLocalSlot 回傳 null 表示超出顯示範圍（週末或非 9–17），直接捨棄
                          return local ? [slot(local.day, local.hour)] : [];
                        });

                        return (
                          <>
                            {/* [MODIFIED] 說明文字改為顯示「我的時區」，讓使用者知道時間已換算至自己的時區 */}
                            <p className="text-xs text-muted-foreground mb-3">
                              以下時間已換算至你的時區（
                              <span className="font-medium text-foreground">{formatTimezoneOffset(me.timezone)}</span>
                              ），{viewing.name} 原始時區為 {formatTimezoneOffset(viewing.timezone)}
                            </p>
                            {/* [MODIFIED] 傳入換算後的時段（viewingInMyTz）而非原始的 viewing.availability，
                                使格線以「我的時區」顯示該成員的空閒時段 */}
                            <ScheduleGrid availability={viewingInMyTz} />
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ── Tab 4: Common Availability ── */}
          <TabsContent value="common">
            <div className="mb-5">
              <h2 className="text-base font-semibold">共同空閒時間</h2>
              {/* [MODIFIED] 說明文字加入時區說明：共同空閒以 UTC 計算，結果轉換為「我」的時區顯示 */}
              <p className="text-sm text-muted-foreground mt-0.5">
                所有 {members.length} 位成員都空閒的時段，以你的時區（
                <span className="font-medium text-foreground">
                  {/* [MODIFIED] 動態顯示「我」的時區偏移量（含夏令時間） */}
                  {formatTimezoneOffset(me.timezone)}
                </span>
                ）顯示
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <Legend
                  items={[
                    { color: "bg-emerald-400", label: "共同空閒" },
                    { color: "bg-muted border border-border", label: "非共同" },
                  ]}
                />
                {commonSlots.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10 text-sm">
                    目前沒有共同空閒時段
                  </p>
                ) : (
                  <ScheduleGrid availability={commonSlots} emerald />
                )}
              </CardContent>
            </Card>

            {commonSlots.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {commonSlots.map((s) => {
                  const [d, h] = s.split("-").map(Number);
                  return (
                    <div
                      key={s}
                      className="text-sm px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-200"
                    >
                      {/* [MODIFIED] 時間列表顯示的是已轉回「我」的時區的本地時間 */}
                      {DAYS[d]} {h}:00–{h + 1}:00
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
