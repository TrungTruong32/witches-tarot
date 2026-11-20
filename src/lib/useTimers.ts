// Sổ hẹn giờ (createTimers) gắn với một component: tự xoá mọi hẹn giờ còn chờ khi gỡ.
import { useEffect, useState } from 'react';
import { createTimers, type Timers } from './timers';

export function useTimers(): Timers {
  const [timers] = useState(createTimers);
  useEffect(() => () => timers.clear(), [timers]);
  return timers;
}
