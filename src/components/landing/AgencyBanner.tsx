/**
 * The agencies Ali takes referrals through, shown as their own logos.
 *
 * Used with each agency's permission. Assets were taken from their public
 * sites and are stored locally in /public/logos so the banner never depends on
 * a third party's CDN staying up (or their file paths staying put).
 *
 * Not lazy-loaded: the banner sits near the top of the landing page, so lazy
 * loading saves nothing and the intersection gate does not reliably fire here.
 * The width/height attributes are the assets' intrinsic sizes and exist to
 * reserve the box before load, not to size the rendered logo (CSS does that).
 *
 * Heights are set per-logo rather than uniformly: Bonas MacFarlane's is a wide
 * wordmark, the other two are tall stacked marks, so a single height would make
 * one look enormous next to the others. These values match them optically.
 *
 * Bonas MacFarlane ship their wordmark in white for their dark header; the
 * local copy is recoloured to their brand navy (#011C35) to sit on this site's
 * light canvas.
 */
const AGENCIES = [
  {
    name: "Dulwich Tutors",
    src: "/logos/dulwich-tutors.png",
    width: 431,
    height: 525,
    className: "h-14",
  },
  {
    name: "Ivy Education",
    src: "/logos/ivy-education.png",
    width: 200,
    height: 211,
    className: "h-14",
  },
  {
    name: "Bonas MacFarlane",
    src: "/logos/bonas-macfarlane.svg",
    width: 280,
    height: 43,
    className: "h-6",
  },
] as const;

export function AgencyBanner() {
  return (
    <section aria-labelledby="agencies-heading" className="border-y border-border/70 bg-card/40">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
        {/* `.eyebrow` is inline-flex (it carries a leading rule), so `text-center`
            on the heading itself no longer centres it — the flex wrapper does. */}
        <div className="flex justify-center">
          <h2 id="agencies-heading" className="eyebrow">
            Accepting referrals through
          </h2>
        </div>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16">
          {AGENCIES.map(({ name, src, width, height, className }) => (
            <li key={name} className="flex items-center">
              <img
                src={src}
                alt={name}
                width={width}
                height={height}
                decoding="async"
                className={`${className} w-auto max-w-[10rem] object-contain`}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
