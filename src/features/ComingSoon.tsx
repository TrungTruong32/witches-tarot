// Chỗ giữ tạm cho màn hình chưa chuyển xong (chỉ có trên nhánh đang làm, không lên Production).
export function ComingSoon() {
  return <p className="status">Màn hình này đang được chuyển sang bản mới.</p>;
}
