import svgPaths from "./svg-5pih385463";

function Paragraph() {
  return (
    <div className="absolute h-[19.514px] left-0 top-0 w-[85.243px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[19.5px] left-0 not-italic text-[13px] text-[rgba(255,255,255,0.4)] top-[0.25px]">Добрый день</p>
    </div>
  );
}

function Heading() {
  return (
    <div className="absolute h-[38.989px] left-0 top-[19.51px] w-[85.243px]" data-name="Heading 1">
      <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[39px] left-0 not-italic text-[26px] text-white top-[-0.26px]">Dev</p>
    </div>
  );
}

function Container2() {
  return (
    <div className="h-[58.504px] relative shrink-0 w-[85.243px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Paragraph />
        <Heading />
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="bg-gradient-to-b from-[#6c5ce7] relative rounded-[41822700px] shadow-[0px_4px_16px_0px_rgba(108,92,231,0.3)] shrink-0 size-[43.995px] to-[#a29bfe]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center overflow-clip relative rounded-[inherit] size-full">
        <p className="font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[27px] not-italic relative shrink-0 text-[#f5f5f7] text-[18px] text-center">D</p>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="absolute content-stretch flex h-[58.504px] items-center justify-between left-[19.98px] top-[55.99px] w-[544.605px]" data-name="Container">
      <Container2 />
      <Button />
    </div>
  );
}

function Icon() {
  return (
    <div className="absolute left-[75.53px] size-[19.982px] top-[12px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5102)" id="Icon">
          <path d={svgPaths.p150fa740} id="Vector" stroke="var(--stroke-0, #FF8904)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5102">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Paragraph1() {
  return (
    <div className="absolute h-[29.992px] left-[12px] top-[35.97px] w-[147.038px]" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Bold',sans-serif] font-bold leading-[30px] left-[73.76px] not-italic text-[20px] text-center text-white top-[-0.51px]">0</p>
    </div>
  );
}

function Paragraph2() {
  return (
    <div className="absolute h-[16.496px] left-[12px] top-[65.96px] w-[147.038px]" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-[73.63px] not-italic text-[11px] text-[rgba(255,255,255,0.4)] text-center top-[0.25px]">Серия</p>
    </div>
  );
}

function Container4() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[96.948px] left-0 rounded-[16px] top-0 w-[173.524px]" data-name="Container">
      <Icon />
      <Paragraph1 />
      <Paragraph2 />
    </div>
  );
}

function Icon1() {
  return (
    <div className="absolute left-[63.53px] size-[19.982px] top-0" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5085)" id="Icon">
          <path d={svgPaths.p16f63600} id="Vector" stroke="var(--stroke-0, #FDC700)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5085">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Text1() {
  return (
    <div className="absolute h-[29.992px] left-0 top-0 w-[13.496px]" data-name="Text">
      <p className="-translate-x-1/2 absolute font-['Inter:Bold',sans-serif] font-bold leading-[30px] left-[7px] not-italic text-[20px] text-center text-white top-[-0.51px]">0</p>
    </div>
  );
}

function Text() {
  return (
    <div className="absolute h-[29.992px] left-[66.78px] top-[23.97px] w-[13.496px]" data-name="Text">
      <Text1 />
    </div>
  );
}

function Container7() {
  return (
    <div className="h-[53.966px] relative shrink-0 w-full" data-name="Container">
      <Icon1 />
      <Text />
    </div>
  );
}

function Paragraph3() {
  return (
    <div className="h-[16.496px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-[73.75px] not-italic text-[11px] text-[rgba(255,255,255,0.4)] text-center top-[0.25px]">XP</p>
    </div>
  );
}

function Container6() {
  return (
    <div className="content-stretch flex flex-col h-[70.461px] items-start relative shrink-0 w-full" data-name="Container">
      <Container7 />
      <Paragraph3 />
    </div>
  );
}

function Container5() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex flex-col h-[96.948px] items-start left-[185.52px] pb-[1.246px] pt-[13.243px] px-[13.243px] rounded-[16px] top-0 w-[173.544px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Container6 />
    </div>
  );
}

function Icon2() {
  return (
    <div className="absolute left-[75.53px] size-[19.982px] top-[12px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5060)" id="Icon">
          <path d={svgPaths.p142ff100} id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
          <path d={svgPaths.p1c3f6500} id="Vector_2" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
          <path d="M3.33026 18.3165H16.6513" id="Vector_3" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
          <path d={svgPaths.p16505800} id="Vector_4" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
          <path d={svgPaths.p2e1cce20} id="Vector_5" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
          <path d={svgPaths.p28ec3f00} id="Vector_6" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5060">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Paragraph4() {
  return (
    <div className="absolute h-[29.992px] left-[12px] top-[35.97px] w-[147.057px]" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Bold',sans-serif] font-bold leading-[30px] left-[73.78px] not-italic text-[20px] text-center text-white top-[-0.51px]">0</p>
    </div>
  );
}

function Paragraph5() {
  return (
    <div className="absolute h-[16.496px] left-[12px] top-[65.96px] w-[147.057px]" data-name="Paragraph">
      <p className="-translate-x-1/2 absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-[73.81px] not-italic text-[11px] text-[rgba(255,255,255,0.4)] text-center top-[0.25px]">Готово</p>
    </div>
  );
}

function Container8() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[96.948px] left-[371.06px] rounded-[16px] top-0 w-[173.544px]" data-name="Container">
      <Icon2 />
      <Paragraph4 />
      <Paragraph5 />
    </div>
  );
}

function Container3() {
  return (
    <div className="absolute h-[96.948px] left-[19.98px] top-[138.49px] w-[544.605px]" data-name="Container">
      <Container4 />
      <Container5 />
      <Container8 />
    </div>
  );
}

function Icon3() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5097)" id="Icon">
          <path d="M7.49796 1.49959H10.4971" id="Vector" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p214a6ca0} id="Vector_2" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p37cb1e00} id="Vector_3" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5097">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container11() {
  return (
    <div className="relative rounded-[20px] shrink-0 size-[35.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(0, 206, 201, 0.2) 0%, rgba(108, 92, 231, 0.2) 100%)" }}>
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
        <Icon3 />
      </div>
    </div>
  );
}

function Paragraph6() {
  return (
    <div className="h-[17.995px] relative shrink-0 w-[87.775px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="-translate-x-1/2 absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[18px] left-[44px] not-italic text-[12px] text-center text-white top-[0.25px]">Фокус-таймер</p>
      </div>
    </div>
  );
}

function Container10() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex flex-col gap-[5.998px] h-[90.443px] items-center left-0 px-[1.246px] py-[15.229px] rounded-[16px] top-0 w-[174.868px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Container11 />
      <Paragraph6 />
    </div>
  );
}

function Icon4() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g id="Icon">
          <path d="M8.99755 14.9959H15.7457" id="Vector" stroke="var(--stroke-0, #FDC700)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p2be1f000} id="Vector_2" stroke="var(--stroke-0, #FDC700)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
      </svg>
    </div>
  );
}

function Container13() {
  return (
    <div className="relative rounded-[20px] shrink-0 size-[35.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(253, 199, 0, 0.2) 0%, rgba(253, 121, 168, 0.2) 100%)" }}>
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
        <Icon4 />
      </div>
    </div>
  );
}

function Paragraph7() {
  return (
    <div className="h-[17.995px] relative shrink-0 w-[50.947px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="-translate-x-1/2 absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[18px] left-[25px] not-italic text-[12px] text-center text-white top-[0.25px]">Заметка</p>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex flex-col gap-[5.998px] h-[90.443px] items-center left-[184.86px] px-[1.246px] py-[15.229px] rounded-[16px] top-0 w-[174.868px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Container13 />
      <Paragraph7 />
    </div>
  );
}

function Icon5() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5092)" id="Icon">
          <path d={svgPaths.p222497a0} id="Vector" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p13f6c900} id="Vector_2" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M8.99755 14.2461V16.4955" id="Vector_3" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5092">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container15() {
  return (
    <div className="relative rounded-[20px] shrink-0 size-[35.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(0, 206, 201, 0.2) 0%, rgba(253, 121, 168, 0.2) 100%)" }}>
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
        <Icon5 />
      </div>
    </div>
  );
}

function Paragraph8() {
  return (
    <div className="h-[17.995px] relative shrink-0 w-[34.744px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="-translate-x-1/2 absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[18px] left-[17.5px] not-italic text-[12px] text-center text-white top-[0.25px]">Голос</p>
      </div>
    </div>
  );
}

function Container14() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex flex-col gap-[5.998px] h-[90.443px] items-center left-[369.72px] px-[1.246px] py-[15.229px] rounded-[16px] top-0 w-[174.868px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Container15 />
      <Paragraph8 />
    </div>
  );
}

function Container9() {
  return (
    <div className="absolute h-[90.443px] left-[19.98px] top-[259.43px] w-[544.605px]" data-name="Container">
      <Container10 />
      <Container12 />
      <Container14 />
    </div>
  );
}

function Icon6() {
  return (
    <div className="relative shrink-0 size-[11.997px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.9967 11.9967">
        <g id="Icon">
          <path d={svgPaths.p9535780} id="Vector" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p32d45cc0} id="Vector_2" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p2515e300} id="Vector_3" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p22ec49c0} id="Vector_4" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p1e031280} id="Vector_5" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p3c1166a0} id="Vector_6" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p24a25a00} id="Vector_7" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
          <path d={svgPaths.p35b56300} id="Vector_8" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="0.999728" />
        </g>
      </svg>
    </div>
  );
}

function Paragraph9() {
  return (
    <div className="h-[14.976px] relative shrink-0 w-[140.105px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[15px] left-0 not-italic text-[10px] text-[rgba(225,112,85,0.5)] top-[0.25px] tracking-[0.6px]">АКТИВНЫЕ ЧЕЛЛЕНДЖИ</p>
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="h-[14.976px] relative shrink-0 w-[160.086px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[7.985px] items-center relative size-full">
        <Icon6 />
        <Paragraph9 />
      </div>
    </div>
  );
}

function Button1() {
  return (
    <div className="h-[17.995px] relative shrink-0 w-[35.367px]" data-name="Button">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="-translate-x-1/2 absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[18px] left-[18.5px] not-italic text-[12px] text-[rgba(225,112,85,0.4)] text-center top-[0.25px]">Все →</p>
      </div>
    </div>
  );
}

function Container17() {
  return (
    <div className="h-[17.995px] relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between px-[3.992px] relative size-full">
          <Container18 />
          <Button1 />
        </div>
      </div>
    </div>
  );
}

function Icon7() {
  return (
    <div className="relative shrink-0 size-[15.989px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.9892 15.9892">
        <g id="Icon">
          <path d={svgPaths.p344bdb00} id="Vector" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p2d363b80} id="Vector_2" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p1afbc380} id="Vector_3" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p2c68d700} id="Vector_4" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p23b5c380} id="Vector_5" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p3011e900} id="Vector_6" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p29116a00} id="Vector_7" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
          <path d={svgPaths.p3bca7300} id="Vector_8" stroke="var(--stroke-0, #E17055)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.6" strokeWidth="1.33243" />
        </g>
      </svg>
    </div>
  );
}

function Container20() {
  return (
    <div className="bg-[rgba(225,112,85,0.1)] relative rounded-[16px] shrink-0 size-[35.99px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pr-[0.019px] relative size-full">
        <Icon7 />
      </div>
    </div>
  );
}

function Paragraph10() {
  return (
    <div className="h-[19.514px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Inter:Medium',sans-serif] font-medium leading-[19.5px] left-0 not-italic text-[13px] text-[rgba(255,255,255,0.5)] top-[0.25px]">Присоединяйтесь к челленджу!</p>
    </div>
  );
}

function Paragraph11() {
  return (
    <div className="h-[16.496px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.2)] top-[0.25px]">Посмотреть челленджи</p>
    </div>
  );
}

function Container21() {
  return (
    <div className="flex-[1_0_0] h-[36.01px] min-h-px min-w-px relative" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
        <Paragraph10 />
        <Paragraph11 />
      </div>
    </div>
  );
}

function Icon8() {
  return (
    <div className="relative shrink-0 size-[13.983px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 13.9832 13.9832">
        <g id="Icon">
          <path d={svgPaths.p169a1e80} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.1" strokeWidth="1.16527" />
        </g>
      </svg>
    </div>
  );
}

function Container19() {
  return (
    <div className="bg-[rgba(255,255,255,0.04)] h-[70.481px] relative rounded-[16px] shrink-0 w-full" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[11.997px] items-center px-[17.235px] py-[1.246px] relative size-full">
          <Container20 />
          <Container21 />
          <Icon8 />
        </div>
      </div>
    </div>
  );
}

function Container16() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[7.985px] h-[96.461px] items-start left-[19.98px] top-[365.86px] w-[544.605px]" data-name="Container">
      <Container17 />
      <Container19 />
    </div>
  );
}

function Icon9() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5051)" id="Icon">
          <path d={svgPaths.pbb9fe00} id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5051">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container23() {
  return (
    <div className="bg-[rgba(255,255,255,0.04)] relative rounded-[20px] shrink-0 size-[39.983px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pr-[0.019px] relative size-full">
        <Icon9 />
      </div>
    </div>
  );
}

function Paragraph12() {
  return (
    <div className="absolute h-[22.494px] left-0 top-0 w-[426.196px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Medium',sans-serif] font-medium leading-[0] left-0 not-italic text-[15px] text-white top-[-1.75px]">
        <span className="leading-[22.5px]">{`AI-коуч: `}</span>
        <span className="leading-[22.5px] text-[#a29bfe]">💜 Поддерживающий</span>
      </p>
    </div>
  );
}

function Paragraph13() {
  return (
    <div className="absolute h-[17.995px] left-0 top-[22.49px] w-[426.196px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[18px] left-0 not-italic text-[12px] text-[rgba(255,255,255,0.3)] top-[0.25px]">Нажми, чтобы сменить стиль</p>
    </div>
  );
}

function Container24() {
  return (
    <div className="flex-[1_0_0] h-[40.489px] min-h-px min-w-px relative" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Paragraph12 />
        <Paragraph13 />
      </div>
    </div>
  );
}

function Icon10() {
  return (
    <div className="relative shrink-0 size-[15.989px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.9892 15.9892">
        <g clipPath="url(#clip0_54_5013)" id="Icon">
          <path d={svgPaths.p1d55a80} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" strokeWidth="1.33243" />
          <path d={svgPaths.p2b9b3980} id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" strokeWidth="1.33243" />
          <path d={svgPaths.p3823a3a0} id="Vector_3" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" strokeWidth="1.33243" />
        </g>
        <defs>
          <clipPath id="clip0_54_5013">
            <rect fill="white" height="15.9892" width="15.9892" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container22() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex gap-[13.983px] h-[74.96px] items-center left-[19.98px] px-[17.235px] py-[1.246px] rounded-[16px] top-[478.31px] w-[544.605px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[16px]" />
      <Container23 />
      <Container24 />
      <Icon10 />
    </div>
  );
}

function Icon11() {
  return (
    <div className="relative shrink-0 size-[11.997px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 11.9967 11.9967">
        <g clipPath="url(#clip0_54_5044)" id="Icon">
          <path d={svgPaths.p72dd100} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="0.999728" />
        </g>
        <defs>
          <clipPath id="clip0_54_5044">
            <rect fill="white" height="11.9967" width="11.9967" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Paragraph14() {
  return (
    <div className="h-[14.976px] relative shrink-0 w-[108.633px]" data-name="Paragraph">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Inter:Bold',sans-serif] font-bold leading-[15px] left-0 not-italic text-[10px] text-[rgba(255,255,255,0.25)] top-[0.25px] tracking-[0.6px]">БЫСТРЫЙ ДОСТУП</p>
      </div>
    </div>
  );
}

function Container26() {
  return (
    <div className="h-[14.976px] relative shrink-0 w-full" data-name="Container">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[7.985px] items-center pl-[3.992px] relative size-full">
          <Icon11 />
          <Paragraph14 />
        </div>
      </div>
    </div>
  );
}

function Icon12() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5039)" id="Icon">
          <path d={svgPaths.p3651d600} id="Vector" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p69e4480} id="Vector_2" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p3a06be80} id="Vector_3" stroke="var(--stroke-0, #00CEC9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5039">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container29() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[15.99px] rounded-[20px] size-[35.99px] top-[15.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(0, 206, 201, 0.2) 0%, rgba(108, 92, 231, 0.2) 100%)" }}>
      <Icon12 />
    </div>
  );
}

function Paragraph15() {
  return (
    <div className="absolute h-[20.994px] left-[15.99px] top-[61.97px] w-[232.826px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[21px] left-0 not-italic text-[14px] text-white top-[-0.75px]">Мои цели</p>
    </div>
  );
}

function Paragraph16() {
  return (
    <div className="absolute h-[16.496px] left-[15.99px] top-[84.95px] w-[232.826px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.25)] top-[0.25px]">Отслеживайте и выполняйте цели</p>
    </div>
  );
}

function Container30() {
  return <div className="absolute bg-[rgba(0,206,201,0.08)] blur-[25px] left-[216.8px] rounded-[41822700px] size-[63.996px] top-[-15.99px]" data-name="Container" />;
}

function Container28() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[119.928px] left-0 overflow-clip rounded-[16px] top-0 w-[267.297px]" data-name="Container">
      <Container29 />
      <Paragraph15 />
      <Paragraph16 />
      <Container30 />
    </div>
  );
}

function Icon13() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5021)" id="Icon">
          <path d={svgPaths.p305e3140} id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.p2f378b80} id="Vector_2" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M1.49959 10.4971H2.99919" id="Vector_3" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M14.9959 10.4971H16.4955" id="Vector_4" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M11.2469 9.74735V11.2469" id="Vector_5" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M6.74817 9.74735V11.2469" id="Vector_6" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5021">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container32() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[15.99px] rounded-[20px] size-[35.99px] top-[15.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(108, 92, 231, 0.25) 0%, rgba(0, 206, 201, 0.2) 100%)" }}>
      <Icon13 />
    </div>
  );
}

function Paragraph17() {
  return (
    <div className="absolute h-[20.994px] left-[15.99px] top-[61.97px] w-[232.846px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[21px] left-0 not-italic text-[14px] text-white top-[-0.75px]">AI-коуч</p>
    </div>
  );
}

function Paragraph18() {
  return (
    <div className="absolute h-[16.496px] left-[15.99px] top-[84.95px] w-[232.846px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.25)] top-[0.25px]">Твой личный коуч</p>
    </div>
  );
}

function Container33() {
  return <div className="absolute bg-[rgba(108,92,231,0.08)] blur-[25px] left-[216.82px] rounded-[41822700px] size-[63.996px] top-[-15.99px]" data-name="Container" />;
}

function Container31() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[119.928px] left-[277.29px] overflow-clip rounded-[16px] top-0 w-[267.317px]" data-name="Container">
      <Container32 />
      <Paragraph17 />
      <Paragraph18 />
      <Container33 />
    </div>
  );
}

function Icon14() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5000)" id="Icon">
          <path d={svgPaths.p17f05470} id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M14.9959 2.24939V5.24857" id="Vector_2" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M16.4955 3.74898H13.4963" id="Vector_3" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M2.99919 12.7465V14.2461" id="Vector_4" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d="M3.74898 13.4963H2.24939" id="Vector_5" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5000">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container35() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[15.99px] rounded-[20px] size-[35.99px] top-[15.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(108, 92, 231, 0.2) 0%, rgba(162, 155, 254, 0.2) 100%)" }}>
      <Icon14 />
    </div>
  );
}

function Paragraph19() {
  return (
    <div className="absolute h-[20.994px] left-[15.99px] top-[61.97px] w-[232.826px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[21px] left-0 not-italic text-[14px] text-white top-[-0.75px]">Создать путь</p>
    </div>
  );
}

function Paragraph20() {
  return (
    <div className="absolute h-[16.496px] left-[15.99px] top-[84.95px] w-[232.826px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.25)] top-[0.25px]">AI-программа развития</p>
    </div>
  );
}

function Container36() {
  return <div className="absolute bg-[rgba(162,155,254,0.08)] blur-[25px] left-[216.8px] rounded-[41822700px] size-[63.996px] top-[-15.99px]" data-name="Container" />;
}

function Container34() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[119.928px] left-0 overflow-clip rounded-[16px] top-[129.92px] w-[267.297px]" data-name="Container">
      <Container35 />
      <Paragraph19 />
      <Paragraph20 />
      <Container36 />
    </div>
  );
}

function Icon15() {
  return (
    <div className="relative shrink-0 size-[17.995px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.9951 17.9951">
        <g clipPath="url(#clip0_54_5047)" id="Icon">
          <path d="M8.99755 5.24857V15.7457" id="Vector" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
          <path d={svgPaths.pc298df0} id="Vector_2" stroke="var(--stroke-0, #A29BFE)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.49959" />
        </g>
        <defs>
          <clipPath id="clip0_54_5047">
            <rect fill="white" height="17.9951" width="17.9951" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Container38() {
  return (
    <div className="absolute content-stretch flex items-center justify-center left-[15.99px] rounded-[20px] size-[35.99px] top-[15.99px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(162, 155, 254, 0.2) 0%, rgba(253, 121, 168, 0.2) 100%)" }}>
      <Icon15 />
    </div>
  );
}

function Paragraph21() {
  return (
    <div className="absolute h-[20.994px] left-[15.99px] top-[61.97px] w-[232.846px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[21px] left-0 not-italic text-[14px] text-white top-[-0.75px]">Журнал</p>
    </div>
  );
}

function Paragraph22() {
  return (
    <div className="absolute h-[16.496px] left-[15.99px] top-[84.95px] w-[232.846px]" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.25)] top-[0.25px]">Твои мысли и рефлексии</p>
    </div>
  );
}

function Container39() {
  return <div className="absolute bg-[rgba(253,121,168,0.06)] blur-[25px] left-[216.82px] rounded-[41822700px] size-[63.996px] top-[-15.99px]" data-name="Container" />;
}

function Container37() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid h-[119.928px] left-[277.29px] overflow-clip rounded-[16px] top-[129.92px] w-[267.317px]" data-name="Container">
      <Container38 />
      <Paragraph21 />
      <Paragraph22 />
      <Container39 />
    </div>
  );
}

function Container27() {
  return (
    <div className="h-[249.848px] relative shrink-0 w-full" data-name="Container">
      <Container28 />
      <Container31 />
      <Container34 />
      <Container37 />
    </div>
  );
}

function Container25() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[9.991px] h-[274.815px] items-start left-[19.98px] top-[569.26px] w-[544.605px]" data-name="Container">
      <Container26 />
      <Container27 />
    </div>
  );
}

function Icon16() {
  return (
    <div className="relative shrink-0 size-[23.993px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 23.9935 23.9935">
        <g id="Icon">
          <path d={svgPaths.p15f91080} id="Vector" stroke="var(--stroke-0, #FDC700)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.99946" />
          <path d={svgPaths.p75ae840} id="Vector_2" stroke="var(--stroke-0, #FDC700)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.99946" />
        </g>
      </svg>
    </div>
  );
}

function Container41() {
  return (
    <div className="relative rounded-[16px] shrink-0 size-[47.987px]" data-name="Container" style={{ backgroundImage: "linear-gradient(135deg, rgba(253, 199, 0, 0.2) 0%, rgba(255, 137, 4, 0.2) 100%)" }}>
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
        <Icon16 />
      </div>
    </div>
  );
}

function Paragraph23() {
  return (
    <div className="h-[22.494px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Inter:Semi_Bold',sans-serif] font-semibold leading-[22.5px] left-0 not-italic text-[15px] text-white top-[-1.75px]">Мой кошелёк</p>
    </div>
  );
}

function Paragraph24() {
  return (
    <div className="h-[19.514px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Inter:Regular',sans-serif] font-normal leading-[19.5px] left-0 not-italic text-[13px] text-[rgba(255,255,255,0.4)] top-[0.25px]">0 Stars · 0 TON</p>
    </div>
  );
}

function Container42() {
  return (
    <div className="flex-[1_0_0] h-[42.008px] min-h-px min-w-px relative" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
        <Paragraph23 />
        <Paragraph24 />
      </div>
    </div>
  );
}

function Icon17() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g id="Icon">
          <path d={svgPaths.p387a3680} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.2" strokeWidth="1.66513" />
        </g>
      </svg>
    </div>
  );
}

function Container40() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.07)] content-stretch flex gap-[15.989px] h-[82.458px] items-center left-[19.98px] px-[17.235px] py-[1.246px] rounded-[16px] top-[860.07px] w-[544.605px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.1)] border-solid inset-0 pointer-events-none rounded-[16px] shadow-[0px_10px_15px_0px_rgba(0,0,0,0.2),0px_4px_6px_0px_rgba(0,0,0,0.2)]" />
      <Container41 />
      <Container42 />
      <Icon17 />
    </div>
  );
}

function Container() {
  return (
    <div className="absolute bg-[#0a0a0f] h-[1078.499px] left-0 top-0 w-[584.568px]" data-name="Container">
      <Container1 />
      <Container3 />
      <Container9 />
      <Container16 />
      <Container22 />
      <Container25 />
      <Container40 />
    </div>
  );
}

function Container44() {
  return <div className="absolute bg-[rgba(108,92,231,0.15)] blur-[100px] left-[424.56px] rounded-[41822700px] size-[239.993px] top-[-79.98px]" data-name="Container" />;
}

function Container45() {
  return <div className="absolute bg-[rgba(0,206,201,0.1)] blur-[80px] left-[-79.98px] rounded-[41822700px] size-[159.989px] top-[359.49px]" data-name="Container" />;
}

function Container43() {
  return (
    <div className="absolute h-[1078.499px] left-0 overflow-clip top-0 w-[584.568px]" data-name="Container">
      <Container44 />
      <Container45 />
    </div>
  );
}

function PK() {
  return (
    <div className="absolute bg-[#0a0a0f] h-[963.478px] left-0 top-0 w-[584.568px]" data-name="pK">
      <Container />
      <Container43 />
    </div>
  );
}

function Icon18() {
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

function Container48() {
  return <div className="-translate-x-1/2 absolute bg-[#6c5ce7] h-[1.986px] left-[calc(50%-0.29px)] rounded-[41822700px] top-[-7.98px] w-[23.993px]" data-name="Container" />;
}

function Button2() {
  return (
    <div className="relative shrink-0 size-[46px]" data-name="Button">
      <Icon18 />
      <Container48 />
    </div>
  );
}

function Icon19() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5072)" id="Icon">
          <g id="Vector">
            <path d={svgPaths.pd3bcef0} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
            <path d={svgPaths.p989f700} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
            <path d={svgPaths.p2287a480} stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
          </g>
        </g>
        <defs>
          <clipPath id="clip0_54_5072">
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
      <Icon19 />
    </div>
  );
}

function Icon20() {
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

function Button4() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon20 />
    </div>
  );
}

function Icon21() {
  return (
    <div className="relative shrink-0 size-[19.982px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 19.9816 19.9816">
        <g clipPath="url(#clip0_54_5057)" id="Icon">
          <path d={svgPaths.p4765360} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.25" strokeWidth="1.66513" />
        </g>
        <defs>
          <clipPath id="clip0_54_5057">
            <rect fill="white" height="19.9816" width="19.9816" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Button5() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon21 />
    </div>
  );
}

function Icon22() {
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

function Button6() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center py-[3.992px] relative shrink-0 size-[46px]" data-name="Button">
      <Icon22 />
    </div>
  );
}

function Container47() {
  return (
    <div className="content-stretch flex gap-[4px] items-center justify-center px-[12px] relative shrink-0" data-name="Container">
      <Button2 />
      <Button3 />
      <Button4 />
      <Button5 />
      <Button6 />
    </div>
  );
}

function Navigation() {
  return (
    <div className="bg-[rgba(0,0,0,0)] content-stretch flex flex-col items-center p-[8px] relative rounded-[32px] shrink-0 w-[320px]" data-name="Navigation">
      <div aria-hidden="true" className="absolute border-[rgba(255,255,255,0.04)] border-solid border-t-[1.246px] inset-0 pointer-events-none rounded-[32px]" />
      <Container47 />
    </div>
  );
}

function Container46() {
  return (
    <div className="absolute content-stretch flex flex-col h-[112px] items-center justify-end left-0 pb-[16px] top-[851px] w-[585px]" data-name="Container">
      <Navigation />
    </div>
  );
}

function Icon23() {
  return (
    <div className="relative shrink-0 size-[13.983px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 13.9832 13.9832">
        <g clipPath="url(#clip0_54_4992)" id="Icon">
          <path d={svgPaths.p2a224500} id="Vector" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" strokeWidth="1.16527" />
          <path d="M4.66107 12.2353H9.32214" id="Vector_2" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" strokeWidth="1.16527" />
          <path d="M6.99161 9.90478V12.2353" id="Vector_3" stroke="var(--stroke-0, white)" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.3" strokeWidth="1.16527" />
        </g>
        <defs>
          <clipPath id="clip0_54_4992">
            <rect fill="white" height="13.9832" width="13.9832" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Text2() {
  return (
    <div className="h-[16.496px] relative shrink-0 w-[222.212px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Inter:Medium',sans-serif] font-medium leading-[16.5px] left-0 not-italic text-[11px] text-[rgba(255,255,255,0.3)] top-[0.25px]">Dev-режим — без Telegram авторизации</p>
      </div>
    </div>
  );
}

function Container49() {
  return (
    <div className="absolute bg-[rgba(255,255,255,0.04)] content-stretch flex gap-[7.985px] h-[30.985px] items-center justify-center left-[80.28px] pl-[1.246px] pr-[1.265px] py-[1.246px] rounded-[20px] top-[7.98px] w-[423.995px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[1.246px] border-[rgba(255,255,255,0.06)] border-solid inset-0 pointer-events-none rounded-[20px]" />
      <Icon23 />
      <Text2 />
    </div>
  );
}

export default function Become() {
  return (
    <div className="bg-white relative size-full" data-name="BECOME">
      <PK />
      <Container46 />
      <Container49 />
    </div>
  );
}