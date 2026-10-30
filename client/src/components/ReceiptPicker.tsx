import { useEffect, useState } from 'react';

interface ReceiptPickerProps {
  file: File | null;
  onChange: (file: File | null) => void;
  label?: string;
}

// 영수증 사진 고르기. accept="image/*"라서 휴대폰에서는 카메라로 바로 찍거나 앨범에서 고를 수 있고,
// 아이폰 HEIC 사진도 브라우저가 알아서 JPEG로 바꿔서 넘겨준다. 고른 사진은 작은 미리보기로 보여준다.
export default function ReceiptPicker({ file, onChange, label = '영수증 사진 첨부' }: ReceiptPickerProps) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="receipt-picker">
      {preview && <img src={preview} alt="첨부할 영수증 미리보기" className="receipt-thumb" />}
      <label className="receipt-picker-button">
        📷 {file ? '다른 사진 고르기' : label}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            // 같은 파일을 다시 골라도 onChange가 불리도록 비워둔다.
            e.target.value = '';
          }}
        />
      </label>
      {file && (
        <button type="button" onClick={() => onChange(null)}>
          빼기
        </button>
      )}
    </div>
  );
}
