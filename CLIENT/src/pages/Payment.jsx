import { useState, useEffect } from "react";
import { ArrowLeft, Check, CreditCard, Wallet, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Elements } from "@stripe/react-stripe-js";
import PaymentForm from "../components/PaymentForm";
import { loadStripe } from "@stripe/stripe-js";
import { placeOrder, goToPaymentMethodStep, toggleOrderStep } from "../store/slices/orderSlice";
import { clearCart } from "../store/slices/cartSlice";

const Payment = () => {
  const { authUser } = useSelector((state) => state.auth);
  const navigateTo = useNavigate();
  const dispatch = useDispatch();
  const { cart } = useSelector((state) => state.cart);
  const { orderStep, placingOrder, finalPrice } = useSelector((state) => state.order);

  const [stripePromise, setStripePromise] = useState(null);
  const [shippingDetails, setShippingDetails] = useState({
    fullName: "",
    state: "West Bengal",
    phone: "",
    address: "",
    city: "",
    zipCode: "",
    country: "India",
  });

  useEffect(() => {
    loadStripe(import.meta.env.VITE_STRIPE_FRONTEND_KEY)
      .then(setStripePromise)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!authUser) navigateTo("/products");
  }, [authUser, navigateTo]);

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  let totalWithTax = total + total * 0.18;

  if (total < 50) {
    totalWithTax += 2;
  }

  const handleContinueToPayment = (e) => {
    e.preventDefault();
    dispatch(goToPaymentMethodStep());
  };

  const handleSelectPaymentMethod = (method) => {
    const formData = new FormData();
    formData.append("full_name", shippingDetails.fullName);
    formData.append("state", shippingDetails.state);
    formData.append("city", shippingDetails.city);
    formData.append("country", shippingDetails.country);
    formData.append("address", shippingDetails.address);
    formData.append("pincode", shippingDetails.zipCode);
    formData.append("phone", shippingDetails.phone);
    formData.append("orderedItems", JSON.stringify(cart));
    formData.append("payment_method", method);

    dispatch(placeOrder(formData)).then((result) => {
      if (placeOrder.fulfilled.match(result) && method === "COD") {
        dispatch(clearCart());
      }
    });
  };

  if (!authUser) return null;

  if (cart.length === 0 && orderStep < 3) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="text-center glass-panel max-w-md">
          <h1 className="text-3xl font-bold text-foreground mb-4">No Items in Cart.</h1>
          <p className="text-muted-foreground mb-8">Add some items to your cart before processing to checkout.</p>
          <Link to={"/products"} className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg text-primary-foreground gradient-primary hover:glow-on-hover animate-smooth font-semibold">
            Browse Products
          </Link>
        </div>
      </div>
    )
  }
  
  return (
  <>
    <div className="min-h-screen pt-20">
      <div className="continer mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* HEADER */}
          <div className="flex items-center space-x-4 mb-8">
            <Link
              to={"/cart"}
              className="p-2 glass-card hover:glow-on-hover animate-smooth"
            >
              <ArrowLeft className="w-5 h-5 text-primary" />
            </Link>
          </div>

          {/* PROGRESS STEPS */}
          <div className="flex items-center justify-center mb-12">
            <div className="flex items-center space-x-4">
              {/* STEP 1 */}
              <div
                className={`flex items-center space-x-2 ${
                  orderStep >= 1 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    orderStep >= 1
                      ? "gradient-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >{orderStep > 1 ? <Check className="w-5 h-5"/> : "1"}
                </div>
                <span className="font-medium">Details</span>
              </div>

              <div className={`w-12 h-0 ${
                orderStep >= 2 ? "bg-primary" : "bg-border"
              }`}
              />

              {/* STEP 2 */}
              <div
                className={`flex items-center space-x-2 ${
                  orderStep >= 2 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    orderStep >= 2
                      ? "gradient-primary text-primary-foreground"
                      : "bg-secondary"
                  }`}
                >{orderStep > 2 ? <Check className="w-5 h-5"/> : "2"}
                </div>
                <span className="font-medium">Payment</span>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* FORM SECTION */}
            <div className="lg:col-span-2">
              {orderStep === 1 && (
                /* STEP 1: USER DETAILS */
                <form onSubmit={handleContinueToPayment} className="glass-panel">
                  <h2 className="text-xl font-semibold text-foreground mb-6">
                    Shipping Information
                  </h2>

                  <div className="mb-6">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Full Name *
                      </label>
                      <input type="text"
                        required
                        value={shippingDetails.fullName}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            fullName: e.target.value,
                          });
                        }}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        State *
                      </label>
                      <select value={shippingDetails.state}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            state: e.target.value,
                          })
                        }}
                          className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                        >
                          <option value="Andhra Pradesh">Andhra Pradesh</option>
                          <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                          <option value="Bihar">Bihar</option>
                          <option value="Goa">Goa</option>
                          <option value="Haryana">Haryana</option>
                          <option value="Jharkhand">Jharkhand</option>
                          <option value="Uttar Pradesh">Uttar Pradesh</option>
                          <option value="West Bengal">West Bengal</option>
                        </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Phone *
                      </label>
                      <input type="tel"
                        required
                        value={shippingDetails.phone}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            phone: e.target.value,
                          });
                        }}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                      />
                    </div>
                  </div>


                  <div className="mb-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Address *
                      </label>
                      <input type="text"
                        required
                        value={shippingDetails.address}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            address: e.target.value,
                          });
                        }}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                      />
                    </div>
                  </div>


                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        City *
                      </label>
                      <input type="text"
                        required
                        value={shippingDetails.city}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            city: e.target.value,
                          });
                        }}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        ZIP Code *
                      </label>
                      <input type="text"
                        required
                        value={shippingDetails.zipCode}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            zipCode: e.target.value,
                          });
                        }}
                        className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Country *
                      </label>
                      <select value={shippingDetails.country}
                        onChange={(e) => {
                          setShippingDetails({
                            ...shippingDetails,
                            country: e.target.value,
                          })
                        }}
                          className="w-full px-4 py-3 bg-secondary border border-border rounded-lg text-foreground"
                        >
                          <option value="India">India</option>
                        </select>
                    </div>
                  </div>

                  <button type="submit" className="w-full py-3 gradient-primary text-primary-foreground rounded-lg hover:glow-on-hover animate-smooth font-semibold">
                    Continue to Payment
                  </button>
                </form>
              )}

              {orderStep === 2 && (
                /* STEP 2: PAYMENT METHOD SELECTION */
                <div className="glass-panel">
                  <h2 className="text-xl font-semibold text-foreground mb-6">
                    Choose Payment Method
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod("Card")}
                      disabled={placingOrder}
                      className="flex flex-col items-center justify-center gap-3 p-8 glass-card hover:glow-on-hover animate-smooth border-2 border-transparent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CreditCard className="w-8 h-8 text-primary" />
                      <span className="font-semibold text-foreground">Card Payment</span>
                      <span className="text-sm text-muted-foreground text-center">
                        Pay securely online now
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPaymentMethod("COD")}
                      disabled={placingOrder}
                      className="flex flex-col items-center justify-center gap-3 p-8 glass-card hover:glow-on-hover animate-smooth border-2 border-transparent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Wallet className="w-8 h-8 text-primary" />
                      <span className="font-semibold text-foreground">Cash on Delivery</span>
                      <span className="text-sm text-muted-foreground text-center">
                        Pay with cash when your order arrives
                      </span>
                    </button>
                  </div>
                  {placingOrder && (
                    <p className="text-center text-muted-foreground mt-6">
                      Placing your order...
                    </p>
                  )}
                </div>
              )}

              {orderStep === 3 && (
                <Elements stripe={stripePromise}>
                  <PaymentForm/>
                </Elements>
              )}

              {orderStep === 4 && (
                /* STEP 4: COD ORDER SUCCESSFUL */
                <div className="glass-panel text-center py-12">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Order Placed Successfully!
                  </h2>
                  <p className="text-muted-foreground mb-8">
                    Your order has been confirmed. Please keep{" "}
                    <span className="font-semibold text-foreground">
                      ${Number(finalPrice ?? totalWithTax).toFixed(2)}
                    </span>{" "}
                    ready for cash on delivery.
                  </p>
                  <button
                    onClick={() => {
                      dispatch(toggleOrderStep());
                      navigateTo("/orders");
                    }}
                    className="px-6 py-3 gradient-primary text-primary-foreground rounded-lg hover:glow-on-hover animate-smooth font-semibold"
                  >
                    View My Orders
                  </button>
                </div>
              )}
            </div>

            {/* ORDER SUMMARY */}
            <div className="lg:col-span-1">
              <div className="glass-panel sticky top-24">
                {orderStep < 4 ? (
                  <>
                    <h2 className="text-xl font-semibold text-foreground">
                      Order Summary
                    </h2>

                    <div className="space-y-4 mb-6">
                      {cart.map((item) => {
                        return (
                          <div
                            key={item.product.id}
                            className="flex items-center space-x-3"
                          >
                            <img 
                              src={item.product.images[0].url}
                              alt={item.product.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.product.name}</p>
                              <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-sm font-semibold">
                              ${Number(item.product.price) * item.quantity}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-2 border-t border-[hsla(var(--glass-border))] pt-4">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping</span>
                        <span className="text-green-500">
                          {total >= 50 ? "Free" : "$2"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax</span>
                        <span>
                          {(total * 0.18).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold text-lg pt-2 border-t border-[hsla(var(--glass-border))]">
                        <span>Total</span>
                        <span className="text-primary">
                          {totalWithTax.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-foreground mb-4">
                      Order Total
                    </h2>
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Amount Due (Cash)</span>
                      <span className="text-primary">
                        ${Number(finalPrice ?? totalWithTax).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
  );
};

export default Payment;