-- Create table for manual payments/charges
CREATE TABLE public.manual_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    amount integer NOT NULL,
    currency text NOT NULL DEFAULT 'COP',
    payment_method text,
    reference text,
    notes text,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

-- Only admins can manage manual payments
CREATE POLICY "Admins can view all manual payments"
ON public.manual_payments FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert manual payments"
ON public.manual_payments FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create table for payment alerts sent to users
CREATE TABLE public.payment_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    amount integer NOT NULL,
    currency text NOT NULL DEFAULT 'COP',
    message text,
    status text NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    paid_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.payment_alerts ENABLE ROW LEVEL SECURITY;

-- Admins can manage all alerts
CREATE POLICY "Admins can view all payment alerts"
ON public.payment_alerts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert payment alerts"
ON public.payment_alerts FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payment alerts"
ON public.payment_alerts FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own alerts
CREATE POLICY "Users can view their own payment alerts"
ON public.payment_alerts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);