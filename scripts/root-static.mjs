// Tệp dữ liệu ở gốc repo được phép phục vụ khi chạy local (dev server + script so ảnh).
// Danh sách trắng: mọi thứ khác ở gốc (.env, test.ipynb, Data/, .git/…) không bao giờ được phục vụ.
export const ROOT_STATIC = /^\/(tarot\.db|card_en\.json|sky\.json|cardback\.png|cardback-witches\.webp|icon-[\w-]+\.png|apple-touch-icon\.png|manifest\.webmanifest|og-image\.jpg)$/;
