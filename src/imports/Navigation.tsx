import svgPaths from "./svg-hg8um85cbx";

function Icon() {
  return (
    <div className="-translate-x-1/2 -translate-y-1/2 absolute left-[calc(50%-0.19px)] size-[19.982px] top-[calc(50%-0.01px)]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g id="Icon">
          <path d={svgPaths.p302a0a00} id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
        </g>
      </svg>
    </div>
  );
}

function Container1() {
  return <div className="-translate-x-1/2 absolute bg-[#6c5ce7] h-[1.986px] left-[calc(50%-0.29px)] rounded-[41822700px] top-[-7.98px] w-[23.993px]" data-name="Container" />;
}

function Button() {
  return (
    <div className="relative shrink-0 size-[46px]" data-name="Button">
      <Icon />
      <Container1 />
    </div>
  );
}

function Icon1() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5185)" id="Icon">
          <g id="Vector">
            <path d={svgPaths.pd3bcef0} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
            <path d={svgPaths.p989f700} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
            <path d={svgPaths.p2287a480} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
          </g>
        </g>
        <defs>
          <clipPath id="clip0_54_5185">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon1 />
    </div>
  );
}

function Icon2() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g id="Icon">
          <path d={svgPaths.p12d14866} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
        </g>
      </svg>
    </div>
  );
}

function Button2() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon2 />
    </div>
  );
}

function Icon3() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5170)" id="Icon">
          <path d={svgPaths.p4765360} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5170">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Button3() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon3 />
    </div>
  );
}

function Icon4() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g id="Icon">
          <path d={svgPaths.p1a7a4780} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
        </g>
      </svg>
    </div>
  );
}

function Button4() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon4 />
    </div>
  );
}

function Container() {
  return (
    <div className="content-stretch flex gap-[4px] items-center justify-center px-[12px] relative shrink-0" data-name="Container">
      <Button />
      <Button1 />
      <Button2 />
      <Button3 />
      <Button4 />
    </div>
  );
}

export default function Navigation() {
  return (
    <div className="bg-[rgba(0,0,0,0)] content-stretch flex flex-col items-center p-[8px] relative rounded-[32px] size-full" data-name="Navigation">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.04)] border-solid border-t-[1.246px] inset-0 pointer-events-none rounded-[32px]" />
      <Container />
    </div>
  );
}