import Image from "next/image";
import Link from "next/link";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { formatNumber, translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import landing from "@/lib/i18n/messages/landing";
import styles from "./home-landing.module.css";

type Props = {
  locale: Locale;
  stats: { dancers: number | null; teams: number | null; openProjects: number | null };
  faqs: { question: string; answer: string }[];
};

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <span aria-hidden="true" className={styles.arrow}>{diagonal ? "↗" : "→"}</span>;
}

export function HomeLanding({ locale, stats, faqs }: Props) {
  const t = translator(landing, locale);
  const numbers = [
    { value: stats.dancers, label: t("home.stat_dancers") },
    { value: stats.teams, label: t("home.stat_teams") },
    { value: stats.openProjects, label: t("home.stat_calls") },
  ];
  const services = [
    { title: t("home.service_film"), body: t("usecase.mv") },
    { title: t("home.service_stage"), body: t("usecase.stage") },
    { title: t("home.service_choreography"), body: t("usecase.choreography") },
    { title: t("home.service_team"), body: t("usecase.team") },
  ];

  return (
    <main className={styles.page}>
      <a href="#home-content" className={styles.skip}>{t("home.skip")}</a>
      <header className={`${styles.shell} ${styles.header}`}>
        <Link href="/" aria-label={t("home.home_label")} className={styles.logo}>
          <DeetzLogo className="h-9 w-auto" priority />
        </Link>
        <nav aria-label={t("home.nav_label")} className={styles.nav}>
          <Link href="/dancers">{t("nav.dancers")}</Link>
          <Link href="/feed">{t("nav.feed")}</Link>
          <Link href="#how-it-works" className={styles.desktopLink}>{t("home.how")}</Link>
        </nav>
        <div className={styles.account}>
          <LanguageSwitcher icon={false} className={styles.languages} />
          <Link href="/login" className={styles.login}>{t("home.login")}</Link>
        </div>
      </header>

      <section id="home-content" className={`${styles.shell} ${styles.hero}`} data-home-hero>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.eyebrow}>{t("hero.badge")}</p>
            <h1>{t("hero.title")}</h1>
          </div>
          <div className={styles.heroIntro}>
            <p className={styles.lede}>{t("hero.lede")}</p>
            <div className={styles.heroActions}>
              <Link href="/dancers" className={styles.primaryLink}>{t("hero.cta_portfolio")}<Arrow /></Link>
              <Link href="/feed" className={styles.textLink}>{t("hero.cta_feed")}<Arrow /></Link>
            </div>
          </div>
        </div>
        <figure className={styles.heroFigure}>
          <div className={styles.heroImage}>
            <Image
              src="https://img.youtube.com/vi/F9_NEqTZfaw/maxresdefault.jpg"
              alt={t("hero.image_alt")}
              fill
              priority
              sizes="(min-width: 1440px) 1328px, 100vw"
            />
          </div>
          <figcaption>
            <span>{t("home.image_caption")}</span>
            <a href="https://www.youtube.com/watch?v=F9_NEqTZfaw" target="_blank" rel="noopener noreferrer">
              {t("home.watch")}<Arrow diagonal />
            </a>
          </figcaption>
        </figure>
        <dl className={styles.stats}>
          {numbers.map(({ value, label }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value === null ? "—" : formatNumber(value, locale)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how-it-works" className={`${styles.shell} ${styles.paths}`} aria-label={t("home.how")}>
        <article>
          <p className={styles.eyebrow}>{t("home.client_label")}</p>
          <h2>{t("home.client_title")}</h2>
          <p className={styles.body}>{t("home.client_body")}</p>
          <div className={styles.pathLinks}>
            <Link href="/dancers" className={styles.textLink}>{t("hero.cta_portfolio")}<Arrow /></Link>
            <Link href="/projects/new" className={styles.textLink}>{t("home.post_call")}<Arrow /></Link>
          </div>
        </article>
        <article>
          <p className={styles.eyebrow}>{t("home.dancer_label")}</p>
          <h2>{t("home.dancer_title")}</h2>
          <p className={styles.body}>{t("home.dancer_body")}</p>
          <div className={styles.pathLinks}>
            <Link href="/feed" className={styles.textLink}>{t("hero.cta_feed")}<Arrow /></Link>
            <Link href="/signup" className={styles.textLink}>{t("home.create_profile")}<Arrow /></Link>
          </div>
        </article>
      </section>

      <section className={styles.services}>
        <div className={`${styles.shell} ${styles.serviceGrid}`}>
          <div className={styles.serviceHeading}>
            <p className={styles.eyebrow}>{t("home.service_label")}</p>
            <h2>{t("home.service_title")}</h2>
            <p className={styles.body}>{t("home.service_body")}</p>
          </div>
          <ul className={styles.serviceList}>
            {services.map(service => (
              <li key={service.title}>
                <h3>{service.title}</h3>
                <p>{service.body}</p>
              </li>
            ))}
          </ul>
          <Link href="/program" className={styles.programLink}>
            <span>{t("home.program_label")}<strong>{t("home.program_title")}</strong></span>
            <Arrow diagonal />
          </Link>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.faq}`}>
        <div>
          <p className={styles.eyebrow}>{t("home.faq_label")}</p>
          <h2>{t("faq.title")}</h2>
          <Link href="/guide" className={styles.textLink}>{t("home.guide")}<Arrow /></Link>
        </div>
        <div className={styles.questions}>
          {faqs.map(faq => (
            <details key={faq.question}>
              <summary>{faq.question}<span aria-hidden="true" className={styles.plus}>+</span></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.shell}>
          <div className={styles.contact}>
            <div>
              <p className={styles.eyebrow}>{t("home.contact_label")}</p>
              <h2>{t("contact.title")}</h2>
              <p className={styles.body}>{t("contact.body")}</p>
            </div>
            <div className={styles.contactLinks}>
              <a href="https://pf.kakao.com/_mbpXX/chat" target="_blank" rel="noopener noreferrer">{t("contact.kakao")}<Arrow diagonal /></a>
              <a href="https://ig.me/m/deetz.kr" target="_blank" rel="noopener noreferrer">{t("contact.instagram")}<Arrow diagonal /></a>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <Link href="/" aria-label={t("home.home_label")}><DeetzLogo className="h-9 w-auto" /></Link>
            <p>{t("home.footer_note")}</p>
            <div><Link href="/terms">{t("home.terms")}</Link><Link href="/privacy">{t("home.privacy")}</Link></div>
          </div>
        </div>
      </footer>
    </main>
  );
}
