import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHousehold } from '../context/HouseholdContext';
import { fetchReceiptUrl } from '../utils/receipt';
import Spinner from './Spinner';

// 거래 목록에 붙는 "영수증" 배지. 누르면 그때 사진을 받아와 화면 위에 크게 띄운다
// (목록을 불러올 때 사진까지 다 받으면 느려지니까 열 때만 받는다).
export default function ReceiptButton({ transactionId }: { transactionId: number }) {
  const { currentId } = useHousehold();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !currentId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setError(false);
    fetchReceiptUrl(currentId, transactionId)
      .then((u) => {
        objectUrl = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, currentId, transactionId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="split-badge receipt-badge" onClick={() => setOpen(true)}>
        🧾 영수증
      </button>
      {/* 배지가 <p> 안에 있어서, <div> 오버레이는 body 바로 아래로 빼서 그린다. */}
      {open &&
        createPortal(
          <div className="receipt-overlay" onClick={() => setOpen(false)} role="dialog" aria-label="영수증 사진">
            {url ? (
              <img src={url} alt="영수증" onClick={(e) => e.stopPropagation()} />
            ) : error ? (
              <p className="receipt-overlay-message">사진을 불러오지 못했습니다.</p>
            ) : (
              <Spinner size="lg" variant="on-primary" />
            )}
            <button type="button" className="receipt-overlay-close" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
