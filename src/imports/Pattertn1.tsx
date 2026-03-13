import svgPaths from "./svg-769x92ozth";
import { imgGroup } from "./svg-3w3hm";

function Group() {
  return (
    <div className="mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[0.508px_4.006px] mask-size-[1080px_1920px] relative size-full" data-name="Group" style={{ maskImage: `url('${imgGroup}')` }}>
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1928.01 1081.02">
        <g id="Group">
          <g id="Vector" />
          <path clipRule="evenodd" d={svgPaths.p28240000} fill="var(--fill-0, #9D9D9D)" fillOpacity="0.2" fillRule="evenodd" id="Vector_2" />
        </g>
      </svg>
    </div>
  );
}

function ClipPathGroup() {
  return (
    <div className="absolute contents inset-0" data-name="Clip path group">
      <div className="absolute flex inset-[-0.21%_-0.05%] items-center justify-center">
        <div className="-rotate-90 flex-none h-[1081.016px] w-[1928.012px]">
          <Group />
        </div>
      </div>
    </div>
  );
}

export default function Pattertn() {
  return (
    <div className="relative size-full" data-name="pattertn 1">
      <ClipPathGroup />
    </div>
  );
}