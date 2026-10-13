import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · Dinero",
  description: "What Dinero stores about you, where, and how to delete it.",
};

// Open to everyone, signed in or not (lib/supabase/access.ts): people read
// this before they create an account. Facts here must match what the app
// really does - when the app changes (a new service, a new kind of data),
// change this page in the same commit.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-base font-medium">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 py-8 lg:p-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">Last updated: 13 October 2026</p>
      </header>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Dinero is a personal expense tracker. You put your own financial
        information into it, so this page says plainly what is kept, where, who
        can see it, and how to get rid of it.
      </p>

      <Section title="What is stored">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Your login:</span> your email
            address and a password hash (if you use email and password), or the
            name, email and profile picture your Google account shares (if you
            use Google sign-in).
          </li>
          <li>
            <span className="text-foreground">What you enter:</span> accounts
            and their balances, categories, transactions (amounts, dates,
            notes, merchants, tags), budgets, recurring rules, and receipt
            photos if you attach any.
          </li>
          <li>
            <span className="text-foreground">Shared spaces:</span> if you
            create or join one, its members can see its contents and each
            other&apos;s email addresses.
          </li>
          <li>
            <span className="text-foreground">On your device:</span> a sign-in
            cookie, a cookie remembering which ledger you are viewing, and your
            theme choice. The app also keeps its own program files (not your
            data) so it can be installed on a phone.
          </li>
        </ul>
      </Section>

      <Section title="What is not done">
        <p>
          No advertising, no analytics or tracking scripts, no selling or
          sharing of your data, and no looking at it except to keep the service
          running or when you ask for help. Your data is not used to train
          anything.
        </p>
      </Section>

      <Section title="Where it lives, and who handles it">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-foreground">Supabase</span> stores the
            database, the sign-in system and the receipt photos, in Amazon Web
            Services&apos; London region (eu-west-2). Receipt photos are in a
            private store: only you (and the members of a shared space, for
            that space) can open them.
          </li>
          <li>
            <span className="text-foreground">Vercel</span> runs the website
            and processes requests to it, which includes standard server logs
            (such as IP address and time of request).
          </li>
          <li>
            <span className="text-foreground">Google</span> is involved only if
            you choose &ldquo;Continue with Google&rdquo;.
          </li>
          <li>
            Confirmation and password-reset emails go out through the email
            service attached to the sign-in system.
          </li>
        </ul>
        <p>
          Everything travels over encrypted connections, and the database is
          set up so that one person&apos;s data cannot be read by another
          account.
        </p>
      </Section>

      <Section title="How long it is kept, and deleting it">
        <p>
          Your data is kept until you delete it. You can erase your account
          yourself, any time: <span className="text-foreground">Settings →
          Delete my account</span>. That removes your login, your personal
          ledger and your receipt photos straight away.
        </p>
        <p>
          In a shared space, what you added stays with the space for the people
          who still use it. If you are the space&apos;s only member, it is
          deleted with you.
        </p>
        <p>
          The hosting provider keeps routine backups of the database for a
          short while (days, not months), so a copy of deleted data can survive
          in a backup until that backup expires. Backups are not used for
          anything else.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can see and correct your data in the app, download your
          transactions as a CSV from Settings, and delete everything as
          described above. If you are in the EU, UK or a similar region you
          also have the right to ask what is held about you, to object to its
          use, and to complain to your data protection authority.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          {CONTACT_EMAIL ? (
            <>
              Questions or requests about your data:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
              .
            </>
          ) : (
            "Questions or requests about your data can be sent to the person who invited you to use Dinero."
          )}
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this changes in a way that matters to you, the date at the top
          changes and the new version is published here.
        </p>
      </Section>

      <p className="pt-2 text-sm">
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          Back to Dinero
        </Link>
      </p>
    </main>
  );
}
