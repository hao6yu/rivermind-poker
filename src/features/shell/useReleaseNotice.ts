import { useCallback, useEffect, useState } from 'react';
import { acknowledgeReleaseNotice, releaseNoticeIsPending } from '../../services/releaseNotice';

export function useReleaseNotice(ready: boolean) {
  const [pending, setPending] = useState(releaseNoticeIsPending);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ready || !pending) {
      setVisible(false);
      return;
    }
    // Allow native startup/setup transitions to finish. Navigation cancels
    // this timer; no network response or timer can steal a live table.
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [pending, ready]);

  const dismiss = useCallback(() => {
    acknowledgeReleaseNotice();
    setPending(false);
    setVisible(false);
  }, []);

  const suppress = useCallback(() => {
    setPending(false);
    setVisible(false);
  }, []);

  return { dismiss, suppress, visible: ready && visible };
}
