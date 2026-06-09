import { useInViewClass } from "../hooks/useInViewClass";
import { McpButton } from "./McpButton";
import { goToQuickstart } from "./quickstart-nav";

export function Cta() {
  const ref = useInViewClass<HTMLElement>();
  return (
    <section ref={ref} className="reveal relative py-[54px] scroll-mt-20">
      <div className="bg-muted bg-[url(/cta.webp)] bg-cover bg-center border border-border rounded-[14px] px-[24px] py-[50px] text-center">
        <h2 className="font-semibold tracking-[-0.035em] leading-[1.05] m-0 mb-[8px] text-foreground [text-wrap:balance] text-[clamp(1.8rem,2.8vw,2.4rem)]">
          Build something with Carbon
        </h2>
        <p className="text-muted-foreground m-0 mb-[20px]">
          Bring your manufacturing system into every AI assistant.
        </p>
        <div className="flex gap-[10px] flex-wrap justify-center">
          <McpButton
            variant="accent"
            href="#quickstart"
            onClick={(e) => {
              e.preventDefault();
              goToQuickstart("Claude Code");
            }}
          >
            Connect to Claude
          </McpButton>
          <McpButton
            href="https://www.carbon.ms/sales"
            target="_blank"
            rel="noopener"
          >
            Talk to sales
          </McpButton>
        </div>
      </div>
    </section>
  );
}
