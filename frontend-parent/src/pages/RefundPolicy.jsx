import PolicyPage from '../components/PolicyPage';

export default function RefundPolicy() {
  return (
    <PolicyPage
      title="Refund and Cancellation Policy"
      updated="24 September 2026"
      summary="This policy explains when an order placed through Hunger Hunt Parent may be cancelled, returned, exchanged, or refunded."
    >
      <section>
        <h2>1. Cancellations</h2>
        <p>
          Cancellation requests will only be considered when made within one day of placing the order.
          A request may not be accepted after the order has been communicated for fulfilment, shipping has
          begun, or the order is out for delivery. Where available, you may reject an eligible product at
          the point of delivery.
        </p>
        <p>
          Perishable items, including eatables, cannot ordinarily be cancelled. A refund or replacement
          may still be considered where you establish that an item delivered was defective, damaged, or
          not of acceptable quality.
        </p>
      </section>

      <section>
        <h2>2. Damaged, defective, or incorrect items</h2>
        <p>
          Report a damaged or defective item to customer service within one day of receiving it. The
          request will be considered after the seller or merchant has inspected and verified the issue.
          If an item is materially different from how it was shown on the platform or from what you
          reasonably expected, notify customer service within one day of receipt. The customer service
          team will review the complaint and decide the appropriate resolution.
        </p>
        <p>
          For a product covered by a manufacturer&apos;s warranty, the issue should be referred to the
          manufacturer under that warranty.
        </p>
      </section>

      <section>
        <h2>3. Returns and exchanges</h2>
        <p>
          Eligible return or exchange requests must be made within one day of purchase. The item must be
          unused, in the condition in which it was received, and in its original packaging. Sale items and
          categories identified as non-returnable at the time of purchase may not qualify. Replacements are
          offered only for items verified as defective or damaged.
        </p>
        <p>
          Once an accepted return is received and inspected, we will notify you. An approved return,
          exchange, or refund will then be processed in accordance with this policy.
        </p>
      </section>

      <section>
        <h2>4. Refund processing</h2>
        <p>
          An approved refund is returned through the same method used to pay for the order:
        </p>
        <ul>
          <li>
            <strong>Orders paid from the student wallet</strong> are refunded to the student wallet. The
            amount is credited back as wallet balance and is not paid out in cash or transferred elsewhere.
          </li>
          <li>
            <strong>Orders paid by UPI</strong> are refunded by UPI to the originating bank account through
            the PhonePe payment gateway&apos;s refund process. Once the refund is initiated, the time taken
            for it to reach your account depends on PhonePe and your bank.
          </li>
        </ul>
        <p>
          If HungerHunt approves a refund, allow up to 30 days for it to be processed. Refunds are not
          issued to a different payment method from the one used for the original order.
        </p>
      </section>

      <section>
        <h2>5. How to request help</h2>
        <p>
          Contact HungerHunt customer service or your school administration with the order details and a
          description of the issue. Requests should include any information reasonably needed to inspect
          and verify the claim.
        </p>
      </section>
    </PolicyPage>
  );
}
