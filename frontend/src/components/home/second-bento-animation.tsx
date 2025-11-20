import { Icons } from '@/components/home/icons';
// Temporarily disabled OrbitingCircles to fix motion import error
// import { OrbitingCircles } from '@/components/home/ui/orbiting-circle';
import { EpsilonLogo } from '@/components/sidebar/chainlens-logo';

export function SecondBentoAnimation() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-background to-transparent z-20"></div>
      <div className="pointer-events-none absolute top-0 left-0 h-20 w-full bg-gradient-to-b from-background to-transparent z-20"></div>

      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 size-16 bg-black p-2 rounded-full z-30 md:bottom-0 md:top-auto">
        <div className="size-10 flex items-center justify-center">
          <EpsilonLogo size={40} />
        </div>
      </div>
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        <div className="relative flex h-full w-full items-center justify-center translate-y-0 md:translate-y-32">
          {/* Temporarily disabled OrbitingCircles to fix motion import error */}
          <div className="flex flex-wrap gap-4 items-center justify-center max-w-md">
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/slack/slack-original.svg" alt="Slack" className="size-8" />
            </div>
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/01/Google_Docs_logo_%282014-2020%29.svg" alt="Google Docs" className="size-8" />
            </div>
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/34/Microsoft_Office_Excel_%282019%E2%80%93present%29.svg" alt="Excel" className="size-8" />
            </div>
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg" alt="Gmail" className="size-8" />
            </div>
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="size-8" />
            </div>
            <div className="size-12 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-100">
              <img src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" className="size-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
