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
          We collect information you provide while registering, using the platform, or communicating
          with us. This may include your name, date of birth, address, mobile number, email address,
          identity or address information, and information connected with your child&apos;s school account.
          We also collect information about orders, wallet activity, payments, preferences, and your use
          of the platform.
        </p>
        <p>
          A payment provider may collect payment-instrument information needed to complete a payment.
          Its collection is governed by its own privacy policy. HungerHunt will never ask you to share a
          debit or credit card PIN, UPI PIN, net-banking password, or mobile-banking password by email
          or telephone.
        </p>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>
          We use personal information to provide requested services, manage parent and student accounts,
          process and fulfil orders, maintain wallet and payment records, improve the customer experience,
          resolve disputes, troubleshoot problems, prevent fraud and other unlawful activity, enforce our
          terms, perform analysis and surveys, and communicate service updates. Where information is used
          for marketing, you may opt out of those communications.
        </p>
      </section>

      <section>
        <h2>4. Sharing and disclosure</h2>
        <p>
          We may share information with our affiliates and with service providers that help us operate the
          platform, fulfil orders, deliver notifications, process payments, prevent fraud, or meet legal
          obligations. Third parties that collect information directly from you apply their own privacy
          policies, which you should review before providing information.
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
          grievance, claim, shipment, payment, fraud concern, or other legitimate purpose, and may retain
          anonymised information for analytics and research.
        </p>
        <p>
          You may ask HungerHunt or your school administration for assistance with account deletion.
          Deletion may be delayed while an order, payment, shipment, grievance, or legal obligation remains
          unresolved. Once an account is deleted, access to that account and its associated information is lost.
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
