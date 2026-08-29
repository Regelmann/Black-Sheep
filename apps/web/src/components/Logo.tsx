export default function Logo() {
  return (
    <a href="#top" className="group flex items-center gap-2.5" aria-label="Black Sheep Field — inicio">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-soft font-display text-sm font-black text-white shadow-lg shadow-primary/30 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
        BΣ
      </span>
      <span className="font-display text-lg font-bold tracking-tight text-white">
        Black&nbsp;Sheep <span className="text-primary-soft">Field</span>
      </span>
    </a>
  );
}
