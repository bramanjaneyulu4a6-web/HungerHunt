import PolicyPage from '../components/PolicyPage';

export default function ShippingPolicy() {
  return (
    <PolicyPage
      title="Shipping Policy"
      summary="This policy describes dispatch, delivery, delays, confirmation, and shipping charges for orders placed through Hunger Hunt Parent."
    >
      <section>
        <h2>1. Shipping method</h2>
        <p>
          Orders are shipped through registered domestic courier companies and/or speed post only.
          The available delivery method may depend on the product, seller, and delivery location.
        </p>
      </section>

      <section>
        <h2>2. Dispatch timeline</h2>
        <p>
          Orders are shipped within three days from the date of the order and/or payment, or according
          to the delivery date agreed at the time of order confirmation. Dispatch and delivery remain
          subject to the operating norms of the courier company or postal authority.
        </p>
      </section>

      <section>
        <h2>3. Delivery address and confirmation</h2>
        <p>
          Orders will be delivered to the address supplied by the buyer at the time of purchase. Delivery
          of services will be confirmed using the email address provided during registration.
        </p>
      </section>

      <section>
        <h2>4. Delays</h2>
        <p>
          HungerHunt is not liable for a delay caused by a courier company or postal authority after an
          order has been handed over for delivery. Please contact customer service or your school
          administration if an order has not arrived within the communicated delivery period.
        </p>
      </section>

      <section>
        <h2>5. Shipping charges</h2>
        <p>
          Any shipping cost charged by the seller or HungerHunt will be shown as part of the transaction.
          Shipping costs are non-refundable.
        </p>
      </section>
    </PolicyPage>
  );
}
