import { useEffect, useState } from "react";
import dayjs from "dayjs";

// Simple, mobile-friendly date/time picker built from daisyUI selects + a
// native date input. Replaces the custom scroll-wheel (WheelPicker), which was
// janky on mobile and defaulted to a non-today date. Keeps the same public
// API ({ oneTime, handleTimeData }) and data shape as the wheel it replaces:
//   { date: YYYY-MM-DD, hour: 1-12, minute: "00"|"15"|"30"|"45", ampm, oneTime }

const hourItems = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: index + 1
}));

// Match the previous 15-minute stepping used by the wheel picker.
const minuteItems = Array.from({ length: 4 }, (_, index) => ({
  value: `${(index * 15).toString().padStart(2, "0")}`,
  label: `${(index * 15).toString().padStart(2, "0")}`
}));

const ampmItems = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" }
];

export default function TimeClock({ oneTime, handleTimeData }) {
  // Date defaults to today (the wheel bug defaulted elsewhere).
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [hour, setHour] = useState(6);
  const [minute, setMinute] = useState("30");
  const [ampm, setAmpm] = useState("AM");

  useEffect(() => {
    handleTimeData((data) => ({
      ...data,
      date,
      hour,
      minute,
      oneTime,
      ampm
    }));
  }, [date, hour, minute, oneTime, ampm]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {oneTime && (
        <input
          type="date"
          className="input input-bordered"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
      )}
      <select
        className="select select-bordered"
        value={hour}
        onChange={(e) => setHour(parseInt(e.target.value, 10))}
        aria-label="Hour"
      >
        {hourItems.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        className="select select-bordered"
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
        aria-label="Minute"
      >
        {minuteItems.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        className="select select-bordered"
        value={ampm}
        onChange={(e) => setAmpm(e.target.value)}
        aria-label="AM/PM"
      >
        {ampmItems.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
