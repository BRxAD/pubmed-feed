import SiteNav from "@/components/brief/SiteNav";
import SiteFooter from "@/components/brief/SiteFooter";
import { brief } from "@/components/brief/briefTheme";

type Props = {
  children: React.ReactNode;
  active?: "/" | "/about" | "/contact" | "/settings";
};

/** Shell for static Brief pages (About, Contact): nav, content, footer. */
export default function BriefSitePage({ children, active }: Props) {
  return (
    <div className={`min-h-screen overflow-x-hidden ${brief.bg} ${brief.ink}`}>
      <SiteNav active={active} />
      <main className="min-w-0">{children}</main>
      <SiteFooter />
    </div>
  );
}
