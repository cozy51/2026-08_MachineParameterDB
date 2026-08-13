export function Brandmark({size=38}:{size?:number}){
  return <svg className="brandmark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="機械パラメータ管理">
    <defs>
      <linearGradient id="brandmark-tile" x1="8" y1="2" x2="56" y2="62" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#12909f"/>
        <stop offset="0.55" stopColor="#0a7381"/>
        <stop offset="1" stopColor="#044b58"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="15" fill="url(#brandmark-tile)"/>
    <rect x="0.9" y="0.9" width="62.2" height="62.2" rx="14.2" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2"/>
    <g stroke="#fff" strokeLinecap="round" strokeWidth="5" fill="none">
      <g strokeOpacity="0.3"><path d="M13 20h38"/><path d="M13 32h38"/><path d="M13 44h38"/></g>
      <g strokeOpacity="0.85"><path d="M13 20h25"/><path d="M13 32h10"/><path d="M13 44h18"/></g>
    </g>
    <g fill="#fff"><circle cx="38" cy="20" r="5"/><circle cx="23" cy="32" r="5"/><circle cx="31" cy="44" r="5"/></g>
  </svg>;
}
