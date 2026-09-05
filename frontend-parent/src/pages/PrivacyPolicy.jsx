import PolicyPage from '../components/PolicyPage';

export default function PrivacyPolicy() {
  return (
    <PolicyPage
      title="Privacy Policy"
      summary="This policy explains how HungerHunt collects, uses, shares, protects, and retains personal information when you use the Hunger Hunt Parent website or mobile application."
    >
      <section>
        <h2>1. Scope and consent</h2>
        <p>
          This policy applies to the Hunger Hunt Parent platform at
          {' '}<a href="https://hunger-hunt-parent.vercel.app/">hunger-hunt-parent.vercel.app</a>,
          including its related mobile application. Our services are offered in India, and personal
          information is primarily stored and processed in India. By using the platform or providing
          information to us, you consent to the practices described in this policy.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <p>
          We collect what the school gives us when it creates your account, and what you do in the app
          afterwards. That is your name, your mobile number and, if provided, your email address; the children linked
          to you, with their names, class, hostel room and wallet balance; the orders placed on those
          wallets and the money moving in and out of them; the settings you choose, such as a spending
          limit or whether a purchase needs your approval; and a notification token for each device you
          sign in on, so that we can reach it. We do not ask for your date of birth, your address, or any
          identity document.
        </p>
        <p>
          We also hold the password you choose for your account, and the four-digit purchase code you
          set for a child to type at the canteen counter. Neither is kept as text: each is stored only
          as a one-way scrambled value that cannot be turned back into what you typed, so nobody at
          HungerHunt can read your password or your child&apos;s code, or tell it to you. A forgotten
          purchase code is replaced using your own account password, never recovered. Your account also
          carries an identifier we generate for it, which is what the sign-in session on each of your
          devices refers to.
        </p>
        <p>
          Our servers also keep an ordinary access log of the requests the app makes — the address
          requested, the time, the result, the app or browser used, and the internet (IP) address the
          request came from. We use it to keep the service running and to limit how often a request can
          be repeated, which is how we protect sign-in and payment from abuse. It is not used to build a
          profile of you and it is not used for advertising.
        </p>
        <p>
          PhonePe, the provider that takes our UPI payments, collects the payment details you enter on
          its own checkout to complete a payment. Those details are collected by PhonePe under its own
          privacy policy and never reach HungerHunt. HungerHunt will never ask you to share a
          debit or credit card PIN, UPI PIN, net-banking password, or mobile-banking password by email
          or telephone.
        </p>
        <p>
          When you verify your phone number during first-time password setup, the number is sent to
          Google Firebase to deliver the SMS code and for spam and abuse prevention. Google processes
          that information under its applicable privacy terms.
        </p>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>
          We use personal information to provide requested services, manage parent and student accounts,
          process and fulfil orders, maintain wallet and payment records, resolve disputes, troubleshoot
          problems, prevent fraud and other unlawful activity, enforce our terms, and communicate
          service updates.
        </p>
        <p>
          We do not use your information for marketing. The only messages this app sends are about your
          own account: a purchase waiting for your approval, a purchase that has gone through, and money
          added to a wallet — plus a password-reset email when you ask for one.
        </p>
      </section>

      <section>
        <h2>4. Sharing and disclosure</h2>
        <p>
          We do not sell your information and we do not share it with affiliates or advertisers. We pass
          information to a small number of service providers, each only for the task named and on the
          terms that provider applies: Google, which sends the one-time SMS that verifies your phone
          number, delivers the app&apos;s notifications, and carries our password-reset email; and
          PhonePe, which takes UPI payments and is told only an order reference and an amount. We ask
          them for nothing beyond those tasks and give them nothing to market to you with, though a
          provider may also use what it receives for its own service — Google, for example, checks the
          phone number you verify for spam and abuse, as described above. Information you enter on
          PhonePe&apos;s own checkout is collected by PhonePe under its own privacy policy.
        </p>
        <p>
          We may disclose information to government agencies, courts, law-enforcement authorities, or
          rights holders when required by law or when reasonably necessary to respond to legal process,
          enforce our terms and policies, investigate unlawful activity, or protect the rights, property,
          or safety of users and the public.
        </p>
      </section>

      <section>
        <h2>5. Security</h2>
        <p>
          We use reasonable security practices and secure systems to protect personal information from
          unauthorised access, disclosure, loss, or misuse. Internet transmission cannot be guaranteed to
          be completely secure, and you are responsible for protecting your account credentials.
        </p>
      </section>

      <section>
        <h2>6. Retention and deletion</h2>
        <p>
          We retain personal information only as long as needed for the purpose for which it was collected
          or as required by applicable law. We may retain information where necessary to address a pending
          grievance, claim, shipment, payment, fraud concern, or other legitimate purpose.
        </p>
        <p>
          You can delete your Hunger Hunt Parent account yourself, from inside the app. Open{' '}
          <strong>Account</strong> and choose <strong>Delete my account</strong>. You will be asked for
          your account password to confirm it, because deletion cannot be undone.
        </p>
        <p>
          Deleting your account ends your ability to sign in. Every device signed in to the account is
          signed out at once, including the one you are deleting from; your saved password is removed;
          every device registered to receive notifications for the account is withdrawn, so nothing
          further is sent to any of them; and the account stops standing as your children&apos;s
          registered parent, so it can no longer see or act on their accounts.
        </p>
        <p>
          One thing will stop a deletion: a purchase still waiting for your approval. Answering it moves
          money, and that is your decision to make rather than something a deletion should make for you.
          Approve or decline the request first, then delete.
        </p>
        <p>
          Your children&apos;s wallet balances and purchase history are not erased. They are the
          school&apos;s record of what a student was given and what they spent — the school&apos;s, not
          your account&apos;s — and they stay with the school. For the same reason, a minimal record of
          your account is retained alongside them, so that approvals you gave and payments you made
          before deletion remain attributable.
        </p>
      </section>

      <section>
        <h2>7. Your rights and choices</h2>
        <p>
          You may request access to, correction of, or updating of your personal information. You may also
          withdraw consent by contacting HungerHunt and stating “Withdrawal of consent for processing
          personal data” in your request. Withdrawal is not retrospective and may limit services that
          require the information concerned.
        </p>
        <p>
          You can also delete your account outright, yourself, from inside the app: open{' '}
          <strong>Account</strong> and choose <strong>Delete my account</strong>. Section 6 sets out what
          deleting removes and what stays with the school.
        </p>
      </section>

      <section>
        <h2>8. Changes and contact</h2>
        <p>
          We may update this policy when our information practices change and will provide notice of
          significant changes when required by law. Questions, privacy requests, and grievances may be
          sent to HungerHunt at 120-3-M-I-S, Sainath Nagar, Revenue Ward No. 120, Kurnool,
          Andhra Pradesh 518003. Support is available Monday to Friday, 9:00 to 18:00.
        </p>
      </section>
    </PolicyPage>
  );
}
