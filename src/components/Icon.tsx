export type IconName =
  | 'home' | 'moon' | 'browse' | 'card' | 'ball' | 'planet' | 'scales' | 'hourglass' | 'gear' | 'sliders'
  | 'install' | 'heart' | 'wand' | 'coin' | 'compass' | 'eye' | 'shuffle' | 'pick' | 'rings';

/** Icon nét mảnh từ sprite (`#i-<name>`), cùng cấu trúc với icoSvg của bản cũ. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
