--
-- PostgreSQL database dump
--

\restrict Wx4mrzbQmRLDd5HbbcF2UEmbNFVLTSpOBta7HOrCoEPSdE7ZVy7J7ND8m93wIMW

-- Dumped from database version 15.18 (Debian 15.18-1.pgdg13+1)
-- Dumped by pg_dump version 15.18 (Debian 15.18-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: admin
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO admin;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: admin
--

COMMENT ON SCHEMA public IS '';


--
-- Name: AppType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."AppType" AS ENUM (
    'individual',
    'enterprise'
);


ALTER TYPE public."AppType" OWNER TO admin;

--
-- Name: ClientType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."ClientType" AS ENUM (
    'android',
    'ios',
    'web'
);


ALTER TYPE public."ClientType" OWNER TO admin;

--
-- Name: FeedbackType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."FeedbackType" AS ENUM (
    'feedback',
    'query'
);


ALTER TYPE public."FeedbackType" OWNER TO admin;

--
-- Name: MessageType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."MessageType" AS ENUM (
    'text',
    'image',
    'audio',
    'video',
    'docs',
    'others'
);


ALTER TYPE public."MessageType" OWNER TO admin;

--
-- Name: PlanDuration; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."PlanDuration" AS ENUM (
    'monthly',
    'yearly'
);


ALTER TYPE public."PlanDuration" OWNER TO admin;

--
-- Name: PlanStatus; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."PlanStatus" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE public."PlanStatus" OWNER TO admin;

--
-- Name: ProductType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."ProductType" AS ENUM (
    'pro_monthly',
    'team_monthly',
    'pro_yearly',
    'team_yearly'
);


ALTER TYPE public."ProductType" OWNER TO admin;

--
-- Name: ShapeType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."ShapeType" AS ENUM (
    'img',
    'stencil',
    'html',
    'shape'
);


ALTER TYPE public."ShapeType" OWNER TO admin;

--
-- Name: SharePermission; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."SharePermission" AS ENUM (
    'view',
    'edit'
);


ALTER TYPE public."SharePermission" OWNER TO admin;

--
-- Name: SubType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."SubType" AS ENUM (
    'users',
    'flows'
);


ALTER TYPE public."SubType" OWNER TO admin;

--
-- Name: TextAlignment; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."TextAlignment" AS ENUM (
    'top',
    'center',
    'bottom'
);


ALTER TYPE public."TextAlignment" OWNER TO admin;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."UserStatus" AS ENUM (
    'draft',
    'success',
    'deleted'
);


ALTER TYPE public."UserStatus" OWNER TO admin;

--
-- Name: UserType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."UserType" AS ENUM (
    'free_user',
    'pro_user',
    'admin'
);


ALTER TYPE public."UserType" OWNER TO admin;

--
-- Name: UserVersion; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."UserVersion" AS ENUM (
    'free',
    'pro',
    'team'
);


ALTER TYPE public."UserVersion" OWNER TO admin;

--
-- Name: VsmOptionType; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."VsmOptionType" AS ENUM (
    'integer',
    'decimal',
    'numeric',
    'text'
);


ALTER TYPE public."VsmOptionType" OWNER TO admin;

--
-- Name: VsmUnit; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."VsmUnit" AS ENUM (
    'None',
    'Seconds',
    'Minutes',
    'Hours',
    'Percentage'
);


ALTER TYPE public."VsmUnit" OWNER TO admin;

--
-- Name: YesNo; Type: TYPE; Schema: public; Owner: admin
--

CREATE TYPE public."YesNo" AS ENUM (
    'yes',
    'no'
);


ALTER TYPE public."YesNo" OWNER TO admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text
);


ALTER TABLE public."Account" OWNER TO admin;

--
-- Name: Session; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public."Session" (
    id text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Session" OWNER TO admin;

--
-- Name: VerificationToken; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public."VerificationToken" (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."VerificationToken" OWNER TO admin;

--
-- Name: add_user_subscriptions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.add_user_subscriptions (
    id text NOT NULL,
    payment_id text,
    subscription_id text,
    team_id text,
    plan_id text,
    user_id text NOT NULL,
    price double precision,
    currency text,
    users_add integer,
    pay_date timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.add_user_subscriptions OWNER TO admin;

--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.admin_logs (
    id text NOT NULL,
    admin_id text NOT NULL,
    target_user_id text,
    action text NOT NULL,
    details jsonb,
    ip_address text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL
);


ALTER TABLE public.admin_logs OWNER TO admin;

--
-- Name: ai_consent; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_consent (
    id text NOT NULL,
    user_id text NOT NULL,
    consented boolean DEFAULT false NOT NULL,
    consented_at timestamp(3) without time zone,
    revoked_at timestamp(3) without time zone,
    ip_address text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.ai_consent OWNER TO admin;

--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_conversations (
    id text NOT NULL,
    user_id text NOT NULL,
    title text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    app_context public."UserVersion"
);


ALTER TABLE public.ai_conversations OWNER TO admin;

--
-- Name: ai_credit_balances; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_credit_balances (
    id text NOT NULL,
    user_id text NOT NULL,
    plan_credits integer DEFAULT 0 NOT NULL,
    addon_credits integer DEFAULT 0 NOT NULL,
    plan_resets_at timestamp(3) without time zone,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.ai_credit_balances OWNER TO admin;

--
-- Name: ai_credit_usages; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_credit_usages (
    id text NOT NULL,
    user_id text NOT NULL,
    feature text NOT NULL,
    credits_used integer NOT NULL,
    source_type text NOT NULL,
    model text,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.ai_credit_usages OWNER TO admin;

--
-- Name: ai_jobs; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_jobs (
    id text NOT NULL,
    user_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    prompt text,
    conversation_id text,
    message_id text,
    app_context text,
    workspace_id text,
    result text,
    model text,
    remaining_credits integer,
    error text,
    completed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    existing_xml text
);


ALTER TABLE public.ai_jobs OWNER TO admin;

--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.ai_messages (
    id text NOT NULL,
    conversation_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    diagram_xml text,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.ai_messages OWNER TO admin;

--
-- Name: apps; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.apps (
    id text NOT NULL,
    legacy_id integer,
    app_name text,
    db_name text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.apps OWNER TO admin;

--
-- Name: chat_files; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_files (
    id text NOT NULL,
    message_id text NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size integer NOT NULL,
    file_path text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.chat_files OWNER TO admin;

--
-- Name: chat_group_users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_group_users (
    id text NOT NULL,
    user_id text NOT NULL,
    group_id text NOT NULL,
    chat_clear timestamp(3) without time zone,
    last_read_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.chat_group_users OWNER TO admin;

--
-- Name: chat_groups; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_groups (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    title text NOT NULL,
    picture text,
    user_id text NOT NULL,
    workspace_id text,
    company_id integer,
    flow_id integer DEFAULT 0 NOT NULL,
    flow_item_id text DEFAULT ''::text NOT NULL,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    is_workspace_room boolean,
    team_id text
);


ALTER TABLE public.chat_groups OWNER TO admin;

--
-- Name: chat_message_users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_message_users (
    id text NOT NULL,
    msg_id text NOT NULL,
    sender_id text NOT NULL,
    receiver_id text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    group_id text NOT NULL,
    team_id integer,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.chat_message_users OWNER TO admin;

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    message text NOT NULL,
    group_id text NOT NULL,
    type public."MessageType" DEFAULT 'text'::public."MessageType" NOT NULL,
    user_id text NOT NULL,
    team_id integer,
    attach_path text,
    link_preview jsonb,
    app_type public."AppType",
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.chat_messages OWNER TO admin;

--
-- Name: contact_submissions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.contact_submissions (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    subject text,
    message text,
    source text DEFAULT 'contact'::text NOT NULL,
    ip_address text,
    emailed boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.contact_submissions OWNER TO admin;

--
-- Name: conversation_users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.conversation_users (
    user_id text NOT NULL,
    conversation_id text NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.conversation_users OWNER TO admin;

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.conversations (
    id text NOT NULL,
    private boolean DEFAULT true NOT NULL,
    data text,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.conversations OWNER TO admin;

--
-- Name: feedback_queries; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.feedback_queries (
    id text NOT NULL,
    message text,
    user_id text NOT NULL,
    msg_type public."FeedbackType" DEFAULT 'feedback'::public."FeedbackType" NOT NULL,
    app_type public."AppType" DEFAULT 'enterprise'::public."AppType" NOT NULL,
    app_device public."ClientType" DEFAULT 'android'::public."ClientType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL
);


ALTER TABLE public.feedback_queries OWNER TO admin;

--
-- Name: firebase_users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.firebase_users (
    id text NOT NULL,
    user_id text NOT NULL,
    fcm_username text,
    fcm_password text,
    fcm_user_id text,
    fcm_token text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    app_context public."UserVersion"
);


ALTER TABLE public.firebase_users OWNER TO admin;

--
-- Name: flow_group_users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flow_group_users (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    flow_id text NOT NULL,
    user_id text NOT NULL,
    group_id text,
    type_flow_share public."YesNo" DEFAULT 'no'::public."YesNo" NOT NULL,
    type_flow_chat public."YesNo" DEFAULT 'no'::public."YesNo" NOT NULL,
    team_id integer DEFAULT 0 NOT NULL,
    created_by_id text,
    app_type public."AppType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.flow_group_users OWNER TO admin;

--
-- Name: flow_limits; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flow_limits (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    user_id text NOT NULL,
    tot_count integer,
    flow_used integer,
    flow_ids text,
    app_type public."AppType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    over_limit_locked boolean DEFAULT false NOT NULL,
    over_limit_modal_shown boolean DEFAULT false NOT NULL
);


ALTER TABLE public.flow_limits OWNER TO admin;

--
-- Name: flow_publishes; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flow_publishes (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    flow_id text NOT NULL,
    user_id text NOT NULL,
    flow_data text,
    app_type public."AppType" NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.flow_publishes OWNER TO admin;

--
-- Name: flow_shares; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flow_shares (
    id text NOT NULL,
    flow_id text NOT NULL,
    shared_by text NOT NULL,
    shared_with text NOT NULL,
    permission public."SharePermission" DEFAULT 'view'::public."SharePermission" NOT NULL,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    requires_pro boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.flow_shares OWNER TO admin;

--
-- Name: flow_versions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flow_versions (
    id text NOT NULL,
    flow_id text NOT NULL,
    xml text NOT NULL,
    thumbnail text,
    saved_by_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.flow_versions OWNER TO admin;

--
-- Name: flows; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.flows (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    name text NOT NULL,
    description text,
    thumbnail text,
    diagram_data text DEFAULT ''::text,
    is_public boolean DEFAULT false NOT NULL,
    is_favorite boolean DEFAULT false NOT NULL,
    workspace_id text NOT NULL,
    project_id text,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    marked_for_downgrade boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    creator_id text,
    last_modified_by_id text
);


ALTER TABLE public.flows OWNER TO admin;

--
-- Name: iap_transactions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.iap_transactions (
    id text NOT NULL,
    user_id text NOT NULL,
    provider text DEFAULT 'revenuecat'::text NOT NULL,
    store text,
    event_id text NOT NULL,
    event_type text NOT NULL,
    product_id text NOT NULL,
    transaction_id text,
    price_cents integer,
    currency text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.iap_transactions OWNER TO admin;

--
-- Name: issue_list; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.issue_list (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    title text NOT NULL,
    flow_id integer NOT NULL,
    flow_item_id text DEFAULT ''::text NOT NULL,
    company_id integer,
    is_checked boolean DEFAULT false NOT NULL,
    created_by text,
    app_type public."AppType",
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    workspace_id text,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL
);


ALTER TABLE public.issue_list OWNER TO admin;

--
-- Name: message_notifications; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.message_notifications (
    id text NOT NULL,
    message_id text NOT NULL,
    conversation_id text NOT NULL,
    user_id text NOT NULL,
    is_seen boolean DEFAULT false NOT NULL,
    is_sender boolean DEFAULT false NOT NULL,
    flagged boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.message_notifications OWNER TO admin;

--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.message_reactions (
    id text NOT NULL,
    message_id text NOT NULL,
    user_id text NOT NULL,
    emoji text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.message_reactions OWNER TO admin;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.messages (
    id text NOT NULL,
    body text NOT NULL,
    conversation_id text NOT NULL,
    user_id text NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.messages OWNER TO admin;

--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.notification_preferences (
    id text NOT NULL,
    user_id text NOT NULL,
    category text NOT NULL,
    app_context public."UserVersion" NOT NULL,
    in_app boolean DEFAULT true NOT NULL,
    push boolean DEFAULT true NOT NULL,
    email boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.notification_preferences OWNER TO admin;

--
-- Name: notification_quiet_hours; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.notification_quiet_hours (
    id text NOT NULL,
    user_id text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    start_hour integer DEFAULT 22 NOT NULL,
    end_hour integer DEFAULT 8 NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.notification_quiet_hours OWNER TO admin;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    action_url text,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(3) without time zone,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    workspace_id text
);


ALTER TABLE public.notifications OWNER TO admin;

--
-- Name: offers; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.offers (
    id text NOT NULL,
    off_name text,
    type text,
    plan_offer text NOT NULL,
    user_offer text,
    start_date timestamp(3) without time zone,
    expired_date timestamp(3) without time zone,
    status public."PlanStatus" DEFAULT 'active'::public."PlanStatus" NOT NULL,
    after_offer_id integer,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.offers OWNER TO admin;

--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.password_resets (
    id text NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.password_resets OWNER TO admin;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.permissions (
    id text NOT NULL,
    name text,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.permissions OWNER TO admin;

--
-- Name: plans; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.plans (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    name text NOT NULL,
    duration public."PlanDuration" DEFAULT 'monthly'::public."PlanDuration" NOT NULL,
    no_duration text,
    price double precision NOT NULL,
    free_trial integer DEFAULT 0,
    grace_period integer DEFAULT 0,
    user_access boolean DEFAULT false NOT NULL,
    user_count integer,
    user_cost double precision,
    status public."PlanStatus" DEFAULT 'active'::public."PlanStatus" NOT NULL,
    permission_access jsonb,
    features jsonb,
    tier integer DEFAULT 0 NOT NULL,
    color_pick text,
    fontname text,
    sub_plan_id jsonb,
    sub_top_id text,
    app_type public."AppType",
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.plans OWNER TO admin;

--
-- Name: pro_flow_purchases; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.pro_flow_purchases (
    id text NOT NULL,
    user_id text NOT NULL,
    flow_count integer NOT NULL,
    amount_cents integer NOT NULL,
    stripe_payment_intent_id text,
    pack_type text DEFAULT 'fifty_flows'::text NOT NULL,
    is_unlimited boolean DEFAULT false NOT NULL,
    expires_at timestamp(3) without time zone,
    grace_period_ends_at timestamp(3) without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    notified_7_days boolean DEFAULT false NOT NULL,
    notified_3_days boolean DEFAULT false NOT NULL,
    notified_1_day boolean DEFAULT false NOT NULL,
    renewed_from_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.pro_flow_purchases OWNER TO admin;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.projects (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    cover_image text,
    created_by text NOT NULL,
    workspace_id text,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.projects OWNER TO admin;

--
-- Name: promocodes; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.promocodes (
    id text NOT NULL,
    promo_code text,
    valid_upto date,
    discount_percentage double precision,
    legacy_source text,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.promocodes OWNER TO admin;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.roles (
    id text NOT NULL,
    legacy_id integer,
    title text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.roles OWNER TO admin;

--
-- Name: shape_groups; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.shape_groups (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    name text NOT NULL,
    user_id text NOT NULL,
    is_predefined boolean DEFAULT false NOT NULL,
    team_id integer DEFAULT 0 NOT NULL,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    workspace_id text
);


ALTER TABLE public.shape_groups OWNER TO admin;

--
-- Name: shapes; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.shapes (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    name text NOT NULL,
    type text DEFAULT 'stencil'::text NOT NULL,
    content text,
    text_alignment text DEFAULT 'bottom'::text NOT NULL,
    ratio_lock boolean DEFAULT true NOT NULL,
    shape_type public."ShapeType" DEFAULT 'img'::public."ShapeType" NOT NULL,
    group_id text,
    owner_id text NOT NULL,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    category text,
    xml_content text,
    thumbnail text,
    is_public boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    workspace_id text,
    associated_team_id text,
    associated_chat_group_id text,
    association_type text
);


ALTER TABLE public.shapes OWNER TO admin;

--
-- Name: subscription_history; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.subscription_history (
    id text NOT NULL,
    user_id text NOT NULL,
    plan_name text,
    product_type text,
    status text NOT NULL,
    price double precision DEFAULT 0 NOT NULL,
    currency text,
    is_recurring boolean DEFAULT false NOT NULL,
    source text,
    started_at timestamp(3) without time zone,
    expires_at timestamp(3) without time zone,
    archived_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_reason text,
    archived_by text,
    stripe_payment_id text,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    snapshot jsonb
);


ALTER TABLE public.subscription_history OWNER TO admin;

--
-- Name: subscription_queue; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.subscription_queue (
    id text NOT NULL,
    user_id text NOT NULL,
    plan_id text NOT NULL,
    payment_id text NOT NULL,
    price double precision NOT NULL,
    currency text,
    permission jsonb,
    device_type public."ClientType" DEFAULT 'web'::public."ClientType" NOT NULL,
    app_type public."AppType",
    users_count integer,
    flows_count text,
    sub_type public."SubType",
    product_type public."ProductType",
    start_date timestamp(3) without time zone,
    plan_endat timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.subscription_queue OWNER TO admin;

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    user_id text NOT NULL,
    plan_id text NOT NULL,
    payment_id text,
    price double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text,
    permission jsonb,
    is_recurring boolean DEFAULT false NOT NULL,
    device_type public."ClientType" DEFAULT 'web'::public."ClientType" NOT NULL,
    app_type public."AppType",
    users_count integer,
    flows_count text,
    sub_type public."SubType",
    product_type public."ProductType",
    paid_app boolean DEFAULT false NOT NULL,
    free_trial integer,
    grace_period integer,
    started_at timestamp(3) without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    deleted_at timestamp(3) without time zone,
    scheduled_plan_type text,
    scheduled_team_members integer,
    scheduled_activation_date timestamp(3) without time zone,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL
);


ALTER TABLE public.subscriptions OWNER TO admin;

--
-- Name: team_invites; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.team_invites (
    id text NOT NULL,
    team_id text NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    invited_by text,
    accepted_by text,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    accepted_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.team_invites OWNER TO admin;

--
-- Name: team_members; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.team_members (
    id text NOT NULL,
    user_id text NOT NULL,
    team_id text,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    app_type public."AppType",
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    workspace_id text NOT NULL,
    team_ids text[] DEFAULT '{}'::text[] NOT NULL
);


ALTER TABLE public.team_members OWNER TO admin;

--
-- Name: teams; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.teams (
    id text NOT NULL,
    legacy_id integer,
    name text,
    description text,
    team_owner_id text NOT NULL,
    team_mem integer DEFAULT 0 NOT NULL,
    count_mem integer DEFAULT 0 NOT NULL,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    verify_team text,
    status public."PlanStatus" DEFAULT 'active'::public."PlanStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.teams OWNER TO admin;

--
-- Name: transaction_logs; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.transaction_logs (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    user_id text,
    charge_id text,
    txn_id text,
    amount_charged integer,
    payment_method text,
    holder_name text,
    currency text,
    status text,
    app_type public."AppType",
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    purchase_type text
);


ALTER TABLE public.transaction_logs OWNER TO admin;

--
-- Name: user_actions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.user_actions (
    id text NOT NULL,
    action text NOT NULL,
    action_model text,
    action_id integer,
    user_id text,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone,
    app_context public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    details jsonb
);


ALTER TABLE public.user_actions OWNER TO admin;

--
-- Name: user_devices; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.user_devices (
    id text NOT NULL,
    user_id text NOT NULL,
    ip_hash text NOT NULL,
    ua_hash text NOT NULL,
    last_seen timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_devices OWNER TO admin;

--
-- Name: user_free_trials; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.user_free_trials (
    id text NOT NULL,
    user_id text NOT NULL,
    pro_monthly boolean DEFAULT false NOT NULL,
    team_monthly boolean DEFAULT false NOT NULL,
    pro_yearly boolean DEFAULT false NOT NULL,
    team_yearly boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.user_free_trials OWNER TO admin;

--
-- Name: user_interests; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.user_interests (
    id text NOT NULL,
    user_id text NOT NULL,
    user_occupation text,
    user_interest jsonb,
    legacy_source text,
    created_at timestamp(3) without time zone,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.user_interests OWNER TO admin;

--
-- Name: users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text,
    email text,
    "emailVerified" timestamp(3) without time zone,
    verify_token text,
    verify_token_expires_at timestamp(3) without time zone,
    image text,
    password text,
    remember_token text,
    role text DEFAULT 'Viewer'::text NOT NULL,
    legacy_vs_id integer,
    legacy_ent_id integer,
    legacy_ind_id integer,
    contact_no text,
    photo text,
    user_type public."UserType" DEFAULT 'free_user'::public."UserType" NOT NULL,
    user_status public."UserStatus" DEFAULT 'success'::public."UserStatus" NOT NULL,
    client_type public."ClientType" DEFAULT 'web'::public."ClientType" NOT NULL,
    welcome_user boolean DEFAULT true NOT NULL,
    company_id integer,
    stripe_customer_id text,
    has_pro boolean DEFAULT false NOT NULL,
    pro_purchased_at timestamp(3) without time zone,
    pro_flow_limit integer DEFAULT 10 NOT NULL,
    pro_additional_flows_purchased integer DEFAULT 0 NOT NULL,
    pro_unlimited_flows boolean DEFAULT false NOT NULL,
    active_flow_pack_id text,
    flow_pack_expires_at timestamp(3) without time zone,
    is_in_flow_picker_phase boolean DEFAULT false NOT NULL,
    flow_addon_stripe_sub_id text,
    flow_addon_plan text,
    flow_addon_status text,
    flow_addon_current_period_end timestamp(3) without time zone,
    current_version public."UserVersion" DEFAULT 'free'::public."UserVersion" NOT NULL,
    is_legacy_pro boolean DEFAULT false NOT NULL,
    refresh_token text,
    p_flow_read boolean DEFAULT false NOT NULL,
    p_flow_modify boolean DEFAULT false NOT NULL,
    p_user_read boolean DEFAULT false NOT NULL,
    p_user_modify boolean DEFAULT false NOT NULL,
    p_shape_read boolean DEFAULT false NOT NULL,
    p_shape_modify boolean DEFAULT false NOT NULL,
    chat_enabled boolean DEFAULT false NOT NULL,
    role_id text,
    admin_note text,
    suspended_at timestamp(3) without time zone,
    suspended_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    last_seen timestamp(3) without time zone,
    last_active_team_id text,
    is_legacy_bcrypt boolean DEFAULT false NOT NULL,
    last_active_pro_team_id text,
    flow_addon_grace_period_end timestamp(3) without time zone,
    is_in_team_picker_phase boolean DEFAULT false NOT NULL,
    team_flow_limit integer DEFAULT 50 NOT NULL,
    team_unlimited_flows boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO admin;

--
-- Name: users_app; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.users_app (
    id text NOT NULL,
    user_id text NOT NULL,
    app_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.users_app OWNER TO admin;

--
-- Name: vsm_options; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.vsm_options (
    id text NOT NULL,
    legacy_id integer,
    legacy_source text,
    title text NOT NULL,
    type public."VsmOptionType" DEFAULT 'text'::public."VsmOptionType" NOT NULL,
    unit public."VsmUnit" DEFAULT 'None'::public."VsmUnit",
    company_id integer,
    team_id integer,
    created_by_id text NOT NULL,
    app_type public."AppType",
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone
);


ALTER TABLE public.vsm_options OWNER TO admin;

--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.webhook_events (
    id text NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    event_id text NOT NULL,
    type text,
    processed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.webhook_events OWNER TO admin;

--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public."Account" (id, "userId", type, provider, "providerAccountId", refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) FROM stdin;
\.


--
-- Data for Name: Session; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public."Session" (id, "sessionToken", "userId", expires) FROM stdin;
\.


--
-- Data for Name: VerificationToken; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public."VerificationToken" (identifier, token, expires) FROM stdin;
\.


--
-- Data for Name: add_user_subscriptions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.add_user_subscriptions (id, payment_id, subscription_id, team_id, plan_id, user_id, price, currency, users_add, pay_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.admin_logs (id, admin_id, target_user_id, action, details, ip_address, created_at, app_context) FROM stdin;
cmpqn8jeq0007w9nn15cw85w4	cmpqkkbd5000121k228ai47n6	\N	user_updated	{"body": {"isVerified": true}, "path": "/api/v1/super-admin/users/cmpqn7e790005w9nnjbgdn6vc", "method": "PUT", "params": {"userId": "cmpqn7e790005w9nnjbgdn6vc"}}	172.30.0.4	2026-05-29 08:11:58.658	free
\.


--
-- Data for Name: ai_consent; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_consent (id, user_id, consented, consented_at, revoked_at, ip_address, created_at, updated_at) FROM stdin;
cmsbx8wgy0003gxrmohjlv675	cmrxp6xwg0000d8j5pnl9zop9	t	2026-08-03 08:19:51.283	\N	172.18.0.2	2026-08-02 14:54:46.114	2026-08-03 08:19:51.284
cmsjy3bta0005ynj3u1y40181	cmshogbjz0006unig73ya73rp	f	\N	\N	172.18.0.2	2026-08-08 05:40:35.087	2026-08-08 05:40:35.087
\.


--
-- Data for Name: ai_conversations; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_conversations (id, user_id, title, created_at, updated_at, app_context) FROM stdin;
cmscyhcm000015gdogd4haqhi	cmrxp6xwg0000d8j5pnl9zop9	what happend	2026-08-03 08:17:06.072	2026-08-03 08:19:19.269	team
cmscvli4g000158zfi0gtyuoe	cmrxp6xwg0000d8j5pnl9zop9	i need to know about logistics and services	2026-08-03 06:56:20.992	2026-08-03 07:56:44.664	team
\.


--
-- Data for Name: ai_credit_balances; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_credit_balances (id, user_id, plan_credits, addon_credits, plan_resets_at, app_context, created_at, updated_at) FROM stdin;
cmpufzer80005bzhwu1itp4qt	cmpqkkbd5000121k228ai47n6	20	0	2026-07-01 00:00:00	free	2026-06-01 00:00:00.116	2026-06-01 00:00:00.116
cmq1a1tmj00018rocz7ctfx5k	cmpqkkbd5000121k228ai47n6	300	0	2026-07-01 00:00:00	team	2026-06-05 18:48:18.235	2026-06-05 18:48:18.235
cmq1a4ny8000e8roc25yfy99k	cmpqkkbd5000121k228ai47n6	200	0	\N	pro	2026-06-05 18:50:30.848	2026-06-05 18:50:30.848
cms2us18u0008cb5ccgi3jjqo	cms2uqs670000cb5ckamr8k1i	10	0	\N	free	2026-07-27 06:35:44.334	2026-07-27 06:35:44.334
cms5wqxby0001i5gyz7k1nhx2	cms2uqs670000cb5ckamr8k1i	200	0	2026-08-01 00:00:00	team	2026-07-29 09:54:10.364	2026-07-29 09:54:10.364
cms8h1g2u0001afh4wvv8mhk5	cmrxp6xwg0000d8j5pnl9zop9	10	0	\N	free	2026-07-31 04:57:45.894	2026-07-31 04:57:45.894
cms9asm7f0024127tyj9ubrwt	cmrxp6xwg0000d8j5pnl9zop9	176	0	2026-08-31 18:50:42.371	team	2026-07-31 18:50:42.406	2026-08-03 15:16:59.658
cmshrb0e30007h65opug9ahbt	cmshogbjz0006unig73ya73rp	10	0	\N	free	2026-08-06 16:55:03.867	2026-08-06 16:55:03.867
cmshs0rzh0001zyhqdermvfj5	cmshogbjz0006unig73ya73rp	200	0	2026-09-01 00:00:00	team	2026-08-06 17:15:06.029	2026-08-06 17:15:06.029
cmsj92yrx000etzwgeetmetk6	cmshogbjz0006unig73ya73rp	50	0	\N	pro	2026-08-07 18:00:27.79	2026-08-07 18:00:27.79
cmsbx7mqf0001gxrm2882k23r	cmrxp6xwg0000d8j5pnl9zop9	50	0	\N	pro	2026-08-02 14:53:46.84	2026-08-07 13:33:08.047
\.


--
-- Data for Name: ai_credit_usages; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_credit_usages (id, user_id, feature, credits_used, source_type, model, app_context, created_at) FROM stdin;
cmscvo4nb000d58zfckt823a0	cmrxp6xwg0000d8j5pnl9zop9	diagram_generation	6	plan	claude-sonnet-4-6	team	2026-08-03 06:58:23.495
cmscwpigu0007i8zi9ruz7wvz	cmrxp6xwg0000d8j5pnl9zop9	diagram_generation	6	plan	claude-sonnet-4-6	team	2026-08-03 07:27:27.678
cmscxr65n000fi8zi3lh0dsuy	cmrxp6xwg0000d8j5pnl9zop9	diagram_generation	6	plan	claude-sonnet-4-6	team	2026-08-03 07:56:44.651
cmscyji75000b5gdo3ouo75gl	cmrxp6xwg0000d8j5pnl9zop9	diagram_generation	6	plan	claude-sonnet-4-6	team	2026-08-03 08:18:46.625
cmscyk7dp000n5gdo2triruap	cmrxp6xwg0000d8j5pnl9zop9	diagram_generation	4	plan	gemini-2.5-flash	team	2026-08-03 08:19:19.26
\.


--
-- Data for Name: ai_jobs; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_jobs (id, user_id, status, prompt, conversation_id, message_id, app_context, workspace_id, result, model, remaining_credits, error, completed_at, created_at, updated_at, existing_xml) FROM stdin;
\.


--
-- Data for Name: ai_messages; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.ai_messages (id, conversation_id, role, content, diagram_xml, metadata, created_at) FROM stdin;
cmscvli4r000358zfq7ix4oct	cmscvli4g000158zfi0gtyuoe	user	i need to know about logistics and services	\N	\N	2026-08-03 06:56:21.003
cmscvmwr2000958zf4xu6ezny	cmscvli4g000158zfi0gtyuoe	assistant	That's an excellent niche! Cosmetic logistics has unique requirements due to product sensitivity, shelf life, regulatory compliance, and brand image.\n\nHere's a detailed procedure for starting a cosmetic logistics business:\n\n**Phase 1: Planning and Research**\n\n*   **Market Research & Niche Identification:**\n    *   Identify your target cosmetic brands (e.g., luxury, organic, mass-market, e-commerce focused).\n    *   Understand their current logistics challenges (e.g., temperature control, international shipping, returns, fulfillment for subscription boxes).\n    *   Analyze competitors and identify your unique selling proposition (USP).\n*   **Business Plan Development:**\n    *   Outline your services (e.g., warehousing, fulfillment, transportation, customs clearance, returns management).\n    *   Detail your operational model, financial projections, marketing strategy, and management team.\n    *   Secure funding if needed.\n*   **Legal Structure & Registration:**\n    *   Choose a legal entity (e.g., sole proprietorship, LLC, corporation).\n    *   Register your business with the relevant authorities.\n    *   Obtain necessary business licenses and permits.\n\n**Phase 2: Operational Setup**\n\n*   **Warehouse/Facility Acquisition:**\n    *   Find a suitable location, potentially near major transport hubs or your target clients.\n    *   Ensure it meets specific requirements for cosmetic storage:\n        *   **Temperature and Humidity Control:** Crucial for product integrity.\n        *   **Cleanliness and Pest Control:** Essential for hygiene and product safety.\n        *   **Security:** High-value products require robust security systems.\n        *   **Fire Safety:** Cosmetics can contain flammable ingredients.\n*   **Technology & Systems:**\n    *   **Warehouse Management System (WMS):** To manage inventory, order fulfillment, and space utilization efficiently.\n    *   **Transportation Management System (TMS):** For route optimization, carrier selection, and tracking.\n    *   **Inventory Management Software:** Crucial for lot tracking, batch management, and expiry date management (FIFO/FEFO).\n    *   **E-commerce Integration:** If you plan to serve online cosmetic brands, seamless integration with platforms like Shopify, Magento, etc., is vital.\n*   **Equipment & Infrastructure:**\n    *   Shelving, forklifts, pallet jacks.\n    *   Packaging materials (sustainable options are a plus for cosmetics).\n    *   Security cameras, alarm systems.\n    *   Climate control systems.\n*   **Staffing:**\n    *   Hire experienced warehouse staff, pickers, packers, and drivers.\n    *   Train them specifically on handling delicate cosmetic products, safety protocols, and regulatory compliance.\n\n**Phase 3: Compliance and Regulations**\n\n*   **Product Safety & Quality:**\n    *   Understand and adhere to regulations from bodies like the FDA (in the US) or similar agencies in your region regarding cosmetic storage and handling.\n    *   Implement Good Manufacturing Practices (GMP) and Good Distribution Practices (GDP) principles.\n*   **Customs & International Shipping:**\n    *   If handling international logistics, thoroughly understand customs regulations, import/export duties, and documentation for cosmetics in various countries.\n    *   Some ingredients may be restricted or prohibited in certain markets.\n*   **Hazardous Materials (HAZMAT):**\n    *   Many cosmetic products (e.g., perfumes, nail polish) are considered HAZMAT due to alcohol content or other chemicals.\n    *   Obtain necessary certifications and train staff for HAZMAT storage, handling, and transportation.\n\n**Phase 4: Marketing and Client Acquisition**\n\n*   **Develop Your Brand Identity:**\n    *   Create a professional website, marketing materials, and a strong brand message.\n*   **Networking:**\n    *   Attend industry trade shows for cosmetics and beauty.\n    *   Connect with cosmetic brand owners, manufacturers, and distributors.\n*   **Sales & Proposals:**\n    *   Develop compelling proposals showcasing your specialized expertise in cosmetic logistics.\n    *   Highlight your capabilities in temperature control, lot tracking, e-commerce fulfillment, and regulatory compliance.\n\n**Phase 5: Continuous Improvement**\n\n*   **Performance Monitoring:**\n    *   Track key metrics like order accuracy, on-time delivery, inventory accuracy, and customer satisfaction.\n*   **Feedback & Adaptation:**\n    *   Regularly solicit feedback from clients to identify areas for improvement and service expansion.\n*   **Stay Updated:**\n    *   Keep abreast of changes in cosmetic regulations, logistics technology, and market trends.\n\nThis is a comprehensive overview. Would you like me to generate a diagram that visualizes this procedure as a flowchart?	\N	{"message": "That's an excellent niche! Cosmetic logistics has unique requirements due to product sensitivity, shelf life, regulatory compliance, and brand image.\\n\\nHere's a detailed procedure for starting a cosmetic logistics business:\\n\\n**Phase 1: Planning and Research**\\n\\n*   **Market Research & Niche Identification:**\\n    *   Identify your target cosmetic brands (e.g., luxury, organic, mass-market, e-commerce focused).\\n    *   Understand their current logistics challenges (e.g., temperature control, international shipping, returns, fulfillment for subscription boxes).\\n    *   Analyze competitors and identify your unique selling proposition (USP).\\n*   **Business Plan Development:**\\n    *   Outline your services (e.g., warehousing, fulfillment, transportation, customs clearance, returns management).\\n    *   Detail your operational model, financial projections, marketing strategy, and management team.\\n    *   Secure funding if needed.\\n*   **Legal Structure & Registration:**\\n    *   Choose a legal entity (e.g., sole proprietorship, LLC, corporation).\\n    *   Register your business with the relevant authorities.\\n    *   Obtain necessary business licenses and permits.\\n\\n**Phase 2: Operational Setup**\\n\\n*   **Warehouse/Facility Acquisition:**\\n    *   Find a suitable location, potentially near major transport hubs or your target clients.\\n    *   Ensure it meets specific requirements for cosmetic storage:\\n        *   **Temperature and Humidity Control:** Crucial for product integrity.\\n        *   **Cleanliness and Pest Control:** Essential for hygiene and product safety.\\n        *   **Security:** High-value products require robust security systems.\\n        *   **Fire Safety:** Cosmetics can contain flammable ingredients.\\n*   **Technology & Systems:**\\n    *   **Warehouse Management System (WMS):** To manage inventory, order fulfillment, and space utilization efficiently.\\n    *   **Transportation Management System (TMS):** For route optimization, carrier selection, and tracking.\\n    *   **Inventory Management Software:** Crucial for lot tracking, batch management, and expiry date management (FIFO/FEFO).\\n    *   **E-commerce Integration:** If you plan to serve online cosmetic brands, seamless integration with platforms like Shopify, Magento, etc., is vital.\\n*   **Equipment & Infrastructure:**\\n    *   Shelving, forklifts, pallet jacks.\\n    *   Packaging materials (sustainable options are a plus for cosmetics).\\n    *   Security cameras, alarm systems.\\n    *   Climate control systems.\\n*   **Staffing:**\\n    *   Hire experienced warehouse staff, pickers, packers, and drivers.\\n    *   Train them specifically on handling delicate cosmetic products, safety protocols, and regulatory compliance.\\n\\n**Phase 3: Compliance and Regulations**\\n\\n*   **Product Safety & Quality:**\\n    *   Understand and adhere to regulations from bodies like the FDA (in the US) or similar agencies in your region regarding cosmetic storage and handling.\\n    *   Implement Good Manufacturing Practices (GMP) and Good Distribution Practices (GDP) principles.\\n*   **Customs & International Shipping:**\\n    *   If handling international logistics, thoroughly understand customs regulations, import/export duties, and documentation for cosmetics in various countries.\\n    *   Some ingredients may be restricted or prohibited in certain markets.\\n*   **Hazardous Materials (HAZMAT):**\\n    *   Many cosmetic products (e.g., perfumes, nail polish) are considered HAZMAT due to alcohol content or other chemicals.\\n    *   Obtain necessary certifications and train staff for HAZMAT storage, handling, and transportation.\\n\\n**Phase 4: Marketing and Client Acquisition**\\n\\n*   **Develop Your Brand Identity:**\\n    *   Create a professional website, marketing materials, and a strong brand message.\\n*   **Networking:**\\n    *   Attend industry trade shows for cosmetics and beauty.\\n    *   Connect with cosmetic brand owners, manufacturers, and distributors.\\n*   **Sales & Proposals:**\\n    *   Develop compelling proposals showcasing your specialized expertise in cosmetic logistics.\\n    *   Highlight your capabilities in temperature control, lot tracking, e-commerce fulfillment, and regulatory compliance.\\n\\n**Phase 5: Continuous Improvement**\\n\\n*   **Performance Monitoring:**\\n    *   Track key metrics like order accuracy, on-time delivery, inventory accuracy, and customer satisfaction.\\n*   **Feedback & Adaptation:**\\n    *   Regularly solicit feedback from clients to identify areas for improvement and service expansion.\\n*   **Stay Updated:**\\n    *   Keep abreast of changes in cosmetic regulations, logistics technology, and market trends.\\n\\nThis is a comprehensive overview. Would you like me to generate a diagram that visualizes this procedure as a flowchart?", "drawioXml": null, "openTemplate": false, "templateName": null, "suggestedSteps": []}	2026-08-03 06:57:26.606
cmscvo4ni000f58zferl8aya9	cmscvli4g000158zfi0gtyuoe	user	yes cosmetic logistice business i need to start what will be the procdeure	\N	\N	2026-08-03 06:58:23.502
cmscvo4nj000h58zf3cz990bg	cmscvli4g000158zfi0gtyuoe	assistant	Diagram generated. Preview below — click Insert to add to canvas.	<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n  <root>\n    <mxCell id="0" />\n    <mxCell id="1" parent="0" />\n\n    <!-- START -->\n    <mxCell id="2" value="&lt;b&gt;▶ Start Your Cosmetic Logistics Business&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="430" y="30" width="310" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 1: Market Research -->\n    <mxCell id="3" value="&lt;b&gt;📊 Phase 1: Market Research&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Identify niche, target brands &amp; competitors&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="430" y="118" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 2: Business Plan -->\n    <mxCell id="4" value="&lt;b&gt;📋 Phase 2: Business Plan&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Define services, pricing &amp; financial projections&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#5B21B6;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;" vertex="1" parent="1">\n      <mxGeometry x="430" y="222" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 3: Legal Registration -->\n    <mxCell id="5" value="&lt;b&gt;🔒 Phase 3: Legal Registration&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Register business, licenses &amp; cosmetic compliance&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1">\n      <mxGeometry x="430" y="326" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 4: Warehouse Setup -->\n    <mxCell id="6" value="&lt;b&gt;🏭 Phase 4: Warehouse Setup&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Climate control, shelving &amp; safety standards&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="430" y="430" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- DECISION: Own Warehouse or 3PL? -->\n    <mxCell id="7" value="&lt;b&gt;◇ Own Warehouse or 3PL?&lt;/b&gt;" style="rhombus;whiteSpace=wrap;html=1;fontStyle=1;shadow=1;fontFamily=Inter;fontSize=13;fillColor=#FFF4E0;strokeColor=#F59E0B;fontColor=#92580A;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="460" y="534" width="250" height="90" as="geometry" />\n    </mxCell>\n\n    <!-- Own Warehouse Branch -->\n    <mxCell id="8" value="&lt;b&gt;🏗️ Lease &amp; Fit Out Warehouse&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Install racking, temp control &amp; security&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="160" y="544" width="240" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- 3PL Branch -->\n    <mxCell id="9" value="&lt;b&gt;🤝 Partner with 3PL Provider&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Negotiate SLA, rates &amp; cosmetic handling terms&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#5B21B6;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;" vertex="1" parent="1">\n      <mxGeometry x="770" y="544" width="240" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 5: Technology -->\n    <mxCell id="10" value="&lt;b&gt;💻 Phase 5: Technology Setup&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;WMS, TMS, order tracking &amp; inventory software&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F766E;strokeWidth=2;fillColor=#E3F6F5;strokeColor=#14B8A6;" vertex="1" parent="1">\n      <mxGeometry x="430" y="658" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- PHASE 6: Carrier Partnerships -->\n    <mxCell id="11" value="&lt;b&gt;🚚 Phase 6: Carrier Partnerships&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Last-mile couriers, freight &amp; cold-chain partners&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1">\n      <mxGeometry x="430" y="762" width="310" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- END -->\n    <mxCell id="12" value="&lt;b&gt;✅ Launch &amp; Acquire First Clients&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#34A881;strokeColor=#2E9673;fontColor=#FFFFFF;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="450" y="866" width="270" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- EDGES -->\n    <mxCell id="13" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="2" target="3" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="14" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="3" target="4" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="15" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="4" target="5" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="16" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="5" target="6" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="17" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="6" target="7" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="18" value="Own" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#34A881;" edge="1" source="7" target="8" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="19" value="3PL" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#EF4444;" edge="1" source="7" target="9" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="20" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="8" target="10" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="21" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="9" target="10" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="22" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="10" target="11" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n    <mxCell id="23" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="11" target="12" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n  </root>\n</mxGraphModel>	{"model": "claude-sonnet-4-6", "intent": "generate_diagram"}	2026-08-03 06:58:23.503
cmscwpih20009i8zipe4gpe3v	cmscvli4g000158zfi0gtyuoe	user	i wan end to end service flow can u regenrte ths	\N	\N	2026-08-03 07:27:27.686
cmscwpih3000bi8zi5zh3140k	cmscvli4g000158zfi0gtyuoe	assistant	Diagram generated. Preview below — click Insert to add to canvas.	<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n  <root>\n    <mxCell id="0" />\n    <mxCell id="1" parent="0" />\n\n    <!-- START -->\n    <mxCell id="2" value="&lt;b&gt;▶ Start&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="480" y="30" width="160" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 1: Client Onboarding -->\n    <mxCell id="3" value="&lt;b&gt;Client Onboarding&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Contract, SLA &amp;amp; brand requirements agreed&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M16%2021v-2a4%204%200%200%200-4-4H6a4%204%200%200%200-4%204v2%22%2F%3E%3Ccircle%20cx%3D%229%22%20cy%3D%227%22%20r%3D%224%22%2F%3E%3Cline%20x1%3D%2219%22%20x2%3D%2219%22%20y1%3D%228%22%20y2%3D%2214%22%2F%3E%3Cline%20x1%3D%2222%22%20x2%3D%2216%22%20y1%3D%2211%22%20y2%3D%2211%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="120" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 2: Order Received -->\n    <mxCell id="4" value="&lt;b&gt;Order Received&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Client places order via portal or EDI&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238B5CF6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%2221%22%20r%3D%221%22%2F%3E%3Ccircle%20cx%3D%2219%22%20cy%3D%2221%22%20r%3D%221%22%2F%3E%3Cpath%20d%3D%22M2.05%202.05h2l2.66%2012.42a2%202%200%200%200%202%201.58h9.78a2%202%200%200%200%201.95-1.57l1.65-7.43H5.12%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="226" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 3: Order Validation -->\n    <mxCell id="5" value="&lt;b&gt;◇ Order Valid?&lt;/b&gt;" style="rhombus;whiteSpace=wrap;html=1;fontStyle=1;shadow=1;fontFamily=Inter;fontSize=13;fillColor=#FFF4E0;strokeColor=#F59E0B;fontColor=#92580A;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="465" y="332" width="190" height="100" as="geometry" />\n    </mxCell>\n\n    <!-- Reject Order (No branch) -->\n    <mxCell id="6" value="&lt;b&gt;Order Rejected&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Client notified to resubmit&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#9B1C1C;strokeWidth=2;fillColor=#FDEBEC;strokeColor=#EF4444;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23EF4444%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%2F%3E%3Cpath%20d%3D%22m15%209-6%206%22%2F%3E%3Cpath%20d%3D%22m9%209%206%206%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="740" y="352" width="260" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 4: Inventory Check -->\n    <mxCell id="7" value="&lt;b&gt;Inventory Check&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Verify stock levels &amp;amp; expiry dates&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cellipse%20cx%3D%2212%22%20cy%3D%225%22%20rx%3D%229%22%20ry%3D%223%22%2F%3E%3Cpath%20d%3D%22M3%205V19A9%203%200%200%200%2021%2019V5%22%2F%3E%3Cpath%20d%3D%22M3%2012A9%203%200%200%200%2021%2012%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="476" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 5: Warehousing &amp; Storage -->\n    <mxCell id="8" value="&lt;b&gt;Warehousing &amp;amp; Storage&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Climate-controlled, beauty-safe storage&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M21%208a2%202%200%200%200-1-1.73l-7-4a2%202%200%200%200-2%200l-7%204A2%202%200%200%200%203%208v8a2%202%200%200%200%201%201.73l7%204a2%202%200%200%200%202%200l7-4A2%202%200%200%200%2021%2016Z%22%2F%3E%3Cpath%20d%3D%22m3.3%207%208.7%205%208.7-5%22%2F%3E%3Cpath%20d%3D%22M12%2022V12%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="582" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 6: Pick &amp; Pack -->\n    <mxCell id="9" value="&lt;b&gt;Pick &amp;amp; Pack&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Branded packaging, kitting &amp;amp; QC check&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%233B82F6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M11%2021.73a2%202%200%200%200%202%200l7-4A2%202%200%200%200%2021%2016V8a2%202%200%200%200-1-1.73l-7-4a2%202%200%200%200-2%200l-7%204A2%202%200%200%200%203%208v8a2%202%200%200%200%201%201.73z%22%2F%3E%3Cpath%20d%3D%22M12%2022V12%22%2F%3E%3Cpolyline%20points%3D%223.29%207%2012%2012%2020.71%207%22%2F%3E%3Cpath%20d%3D%22m7.5%204.27%209%205.15%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="688" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 7: Compliance &amp; Labelling -->\n    <mxCell id="10" value="&lt;b&gt;Compliance &amp;amp; Labelling&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Regulatory labels, batch codes, safety checks&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238B5CF6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%2013c0%205-3.5%207.5-7.66%208.95a1%201%200%200%201-.67-.01C7.5%2020.5%204%2018%204%2013V6a1%201%200%200%201%201-1c2%200%204.5-1.2%206.24-2.72a1.17%201.17%200%200%201%201.52%200C14.51%203.81%2017%205%2019%205a1%201%200%200%201%201%201z%22%2F%3E%3Cpath%20d%3D%22m9%2012%202%202%204-4%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="794" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 8: Dispatch &amp; Shipping -->\n    <mxCell id="11" value="&lt;b&gt;Dispatch &amp;amp; Shipping&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Carrier assigned, tracking number issued&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E3F6F5;strokeColor=#14B8A6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2314B8A6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14%2018V6a2%202%200%200%200-2-2H4a2%202%200%200%200-2%202v11a1%201%200%200%200%201%201h2%22%2F%3E%3Cpath%20d%3D%22M15%2018H9%22%2F%3E%3Cpath%20d%3D%22M19%2018h2a1%201%200%200%200%201-1v-3.65a1%201%200%200%200-.22-.624l-3.48-4.35A1%201%200%200%200%2017.52%208H14%22%2F%3E%3Ccircle%20cx%3D%2217%22%20cy%3D%2218%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%227%22%20cy%3D%2218%22%20r%3D%222%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="900" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 9: Real-Time Tracking -->\n    <mxCell id="12" value="&lt;b&gt;Real-Time Tracking&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Client &amp;amp; end-customer notified with updates&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%233B82F6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%2010c0%204.993-5.539%2010.193-7.399%2011.799a1%201%200%200%201-1.202%200C9.539%2020.193%204%2014.993%204%2010a8%208%200%200%201%2016%200%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2210%22%20r%3D%223%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="1006" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 10: Delivery Confirmation -->\n    <mxCell id="13" value="&lt;b&gt;Delivery Confirmation&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Proof of delivery captured &amp;amp; logged&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20width%3D%228%22%20height%3D%224%22%20x%3D%228%22%20y%3D%222%22%20rx%3D%221%22%20ry%3D%221%22%2F%3E%3Cpath%20d%3D%22M16%204h2a2%202%200%200%201%202%202v14a2%202%200%200%201-2%202H6a2%202%200%200%201-2-2V6a2%202%200%200%201%202-2h2%22%2F%3E%3Cpath%20d%3D%22m9%2014%202%202%204-4%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="1112" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 11: Returns Management -->\n    <mxCell id="14" value="&lt;b&gt;Returns Management&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Inspect, restock or dispose per brand policy&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#FFF4E0;strokeColor=#F59E0B;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23F59E0B%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%2012a9%209%200%200%201%209-9%209.75%209.75%200%200%201%206.74%202.74L21%208%22%2F%3E%3Cpath%20d%3D%22M21%203v5h-5%22%2F%3E%3Cpath%20d%3D%22M21%2012a9%209%200%200%201-9%209%209.75%209.75%200%200%201-6.74-2.74L3%2016%22%2F%3E%3Cpath%20d%3D%22M8%2016H3v5%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="1218" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 12: Reporting &amp; Analytics -->\n    <mxCell id="15" value="&lt;b&gt;Reporting &amp;amp; Analytics&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Performance reports shared with client&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M6%2022a2%202%200%200%201-2-2V4a2%202%200%200%201%202-2h8a2.4%202.4%200%200%201%201.704.706l3.588%203.588A2.4%202.4%200%200%201%2020%208v12a2%202%200%200%201-2%202z%22%2F%3E%3Cpath%20d%3D%22M14%202v5a1%201%200%200%200%201%201h5%22%2F%3E%3Cpath%20d%3D%22M10%209H8%22%2F%3E%3Cpath%20d%3D%22M16%2013H8%22%2F%3E%3Cpath%20d%3D%22M16%2017H8%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="420" y="1324" width="280" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- END -->\n    <mxCell id="16" value="&lt;b&gt;✅ End&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#34A881;strokeColor=#2E9673;fontColor=#FFFFFF;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="480" y="1430" width="160" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- EDGES -->\n    <mxCell id="20" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="2" target="3" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="21" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="3" target="4" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="22" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="4" target="5" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Yes branch -->\n    <mxCell id="23" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#34A881;" edge="1" source="5" target="7" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- No branch -->\n    <mxCell id="24" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#EF4444;" edge="1" source="5" target="6" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="25" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="7" target="8" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="26" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="8" target="9" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="27" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="9" target="10" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="28" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="10" target="11" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="29" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="11" target="12" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="30" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="12" target="13" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="31" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="13" target="14" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="32" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="14" target="15" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="33" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="15" target="16" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n  </root>\n</mxGraphModel>	{"model": "claude-sonnet-4-6", "intent": "generate_diagram"}	2026-08-03 07:27:27.687
cmscyi6dr00075gdotpg46l7u	cmscyhcm000015gdogd4haqhi	assistant	Okay, I've analyzed the attached AWS bill for the period of June 1 - June 30, 2026.\n\nHere's a summary of your AWS spending:\n*   **Total Bill:** USD $151.45\n*   **Highest Cost Service:** Lightsail at USD $84.76 (which is 56% of your total bill), showing a 14.2% increase from the prior month.\n*   **Highest Cost Region:** EU (Stockholm) at USD $92.91, showing a 17.1% increase from the prior month.\n*   **Other Significant Costs:** Amazon WorkMail (USD $19.83) and AWS WAF (USD $8.00).\n\nTo help you reduce costs, here are some recommendations based on your usage:\n\n*   **Lightsail (USD $84.76)**:\n    *   **Review Instance Utilization:** Your largest Lightsail costs come from "2GB bundle Instance" ($34.82) and "8GB bundle Instance" ($42.57) in EU (Stockholm). Assess if these instances are fully utilized or if they can be downsized to smaller bundles if their resource requirements are lower.\n    *   **Container Service Nodes:** The "Container Service Node of Power-Nano" in Asia Pacific (Mumbai) costs $6.77. Check if this container service needs to run 24/7 or if it can be stopped/scaled down during off-peak hours or when not in use.\n    *   **Snapshot Retention:** There's a small charge for Lightsail snapshot data in Asia Pacific (Mumbai). Review your snapshot retention policies to ensure you're not keeping unnecessary backups for too long.\n*   **Amazon WorkMail (USD $19.83)**:\n    *   You have charges for approximately 5 user-months in EU (Ireland). Verify that all these users still require WorkMail services. Deactivating inactive users can lead to savings.\n*   **Virtual Private Cloud (VPC) (USD $3.60)**:\n    *   This cost is for "Idle public IPv4 address per hour" in EU (Stockholm). Identify any unattached or unused Elastic IP addresses and release them. AWS charges for unused IPs to encourage efficient resource allocation.\n*   **Elastic Compute Cloud (EC2) / EBS (USD $2.11)**:\n    *   You have costs for snapshot data and General Purpose SSD (gp2) provisioned storage in EU (Stockholm). Review your EBS snapshot schedules and retention, and ensure your gp2 volumes are sized appropriately for your current needs.\n*   **Relational Database Service (RDS) (USD $1.63)**:\n    *   The primary cost here is for backup storage in EU (Stockholm). Similar to EBS, check your RDS backup retention policies to avoid storing unnecessary backups.\n*   **Route 53 (USD $1.04)**:\n    *   You are charged for 2 Hosted Zones. Confirm if both hosted zones are still active and required for your operations.\n\nBy focusing on these areas, especially Lightsail and WorkMail, you should be able to identify significant cost-saving opportunities.\n\nWould you like me to generate a diagram from this? Tell me what type (flowchart, VSM, org chart, etc.)	\N	{"intent": "analyze_document"}	2026-08-03 08:17:44.655
cmscvllfm000558zfwufjrvv7	cmscvli4g000158zfi0gtyuoe	assistant	Hello there! I can definitely help you understand logistics and services.\n\nHere's a breakdown:\n\n*   **Logistics** refers to the detailed organization and implementation of a complex operation. In a business context, it's typically about managing the flow of things between the point of origin and the point of consumption to meet customer or corporate requirements. This can include:\n    *   **Transportation:** Moving goods from one place to another.\n    *   **Warehousing:** Storing goods before they are moved or distributed.\n    *   **Inventory Management:** Keeping track of stock levels.\n    *   **Packaging and Handling:** Preparing goods for safe transport and storage.\n    *   **Information Flow:** Managing data related to all these activities.\n    The goal of logistics is to get the right product to the right customer at the right time, in the right quantity, and at the right cost.\n\n*   **Services** are intangible activities or benefits that one party can offer to another, which do not result in the ownership of anything. They are consumed at the point of production and often involve human interaction. Examples include:\n    *   **Healthcare services** (doctors, nurses)\n    *   **Financial services** (banking, insurance)\n    *   **Consulting services** (business advice)\n    *   **Educational services** (teachers, trainers)\n    *   **Hospitality services** (hotels, restaurants)\n    *   **Maintenance and repair services**\n\nOften, logistics is a crucial component **within** a service business (e.g., a hospital's logistics for supplies) or a service itself (e.g., a logistics company providing transport services to another business).\n\nDo you have a specific type of logistics or service you're interested in, or perhaps how they might relate to a particular industry?	\N	{"message": "Hello there! I can definitely help you understand logistics and services.\\n\\nHere's a breakdown:\\n\\n*   **Logistics** refers to the detailed organization and implementation of a complex operation. In a business context, it's typically about managing the flow of things between the point of origin and the point of consumption to meet customer or corporate requirements. This can include:\\n    *   **Transportation:** Moving goods from one place to another.\\n    *   **Warehousing:** Storing goods before they are moved or distributed.\\n    *   **Inventory Management:** Keeping track of stock levels.\\n    *   **Packaging and Handling:** Preparing goods for safe transport and storage.\\n    *   **Information Flow:** Managing data related to all these activities.\\n    The goal of logistics is to get the right product to the right customer at the right time, in the right quantity, and at the right cost.\\n\\n*   **Services** are intangible activities or benefits that one party can offer to another, which do not result in the ownership of anything. They are consumed at the point of production and often involve human interaction. Examples include:\\n    *   **Healthcare services** (doctors, nurses)\\n    *   **Financial services** (banking, insurance)\\n    *   **Consulting services** (business advice)\\n    *   **Educational services** (teachers, trainers)\\n    *   **Hospitality services** (hotels, restaurants)\\n    *   **Maintenance and repair services**\\n\\nOften, logistics is a crucial component **within** a service business (e.g., a hospital's logistics for supplies) or a service itself (e.g., a logistics company providing transport services to another business).\\n\\nDo you have a specific type of logistics or service you're interested in, or perhaps how they might relate to a particular industry?", "drawioXml": null, "openTemplate": false, "templateName": null, "suggestedSteps": []}	2026-08-03 06:56:25.283
cmscvmqhj000758zf3qi73wom	cmscvli4g000158zfi0gtyuoe	user	yes cosmetic logistice business i need to start what will be the procdeure	\N	\N	2026-08-03 06:57:18.487
cmscxr65v000hi8zigbb6j5ws	cmscvli4g000158zfi0gtyuoe	user	this related flow is not mwntion as u felled i need excat real time flow	\N	\N	2026-08-03 07:56:44.659
cmscxr65x000ji8zikwpuad8h	cmscvli4g000158zfi0gtyuoe	assistant	Diagram generated. Preview below — click Insert to add to canvas.	<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n  <root>\n    <mxCell id="0" />\n    <mxCell id="1" parent="0" />\n\n    <!-- START -->\n    <mxCell id="2" value="&lt;b&gt;▶ Start&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="490" y="20" width="150" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 1: Client Onboarding -->\n    <mxCell id="3" value="&lt;b&gt;Client Onboarding&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Contract, SLA, brand brief signed&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M16%2021v-2a4%204%200%200%200-4-4H6a4%204%200%200%200-4%204v2%22%2F%3E%3Ccircle%20cx%3D%229%22%20cy%3D%227%22%20r%3D%224%22%2F%3E%3Cline%20x1%3D%2219%22%20x2%3D%2219%22%20y1%3D%228%22%20y2%3D%2214%22%2F%3E%3Cline%20x1%3D%2222%22%20x2%3D%2216%22%20y1%3D%2211%22%20y2%3D%2211%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="108" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 2: Order Received from Client -->\n    <mxCell id="4" value="&lt;b&gt;Order Received&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Purchase order / e-commerce sync&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%233B82F6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%228%22%20cy%3D%2221%22%20r%3D%221%22%2F%3E%3Ccircle%20cx%3D%2219%22%20cy%3D%2221%22%20r%3D%221%22%2F%3E%3Cpath%20d%3D%22M2.05%202.05h2l2.66%2012.42a2%202%200%200%200%202%201.58h9.78a2%202%200%200%200%201.95-1.57l1.65-7.43H5.12%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="212" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 3: Inventory Check Decision -->\n    <mxCell id="5" value="&lt;b&gt;◇ Stock Available?&lt;/b&gt;" style="rhombus;whiteSpace=wrap;html=1;fontStyle=1;shadow=1;fontFamily=Inter;fontSize=13;fillColor=#FFF4E0;strokeColor=#F59E0B;fontColor=#92580A;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="490" y="316" width="160" height="90" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 3a: Replenishment / Supplier Sourcing -->\n    <mxCell id="6" value="&lt;b&gt;Replenishment Request&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Alert supplier / restock from vendor&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#92580A;strokeWidth=2;fillColor=#FFF4E0;strokeColor=#F59E0B;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23F59E0B%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m21.73%2018-8-14a2%202%200%200%200-3.48%200l-8%2014A2%202%200%200%200%204%2021h16a2%202%200%200%200%201.73-3%22%2F%3E%3Cpath%20d%3D%22M12%209v4%22%2F%3E%3Cpath%20d%3D%22M12%2017h.01%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="240" y="326" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 4: Inbound / Goods Receipt -->\n    <mxCell id="7" value="&lt;b&gt;Inbound Goods Receipt&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Unload, count &amp;amp; scan products&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M11%2021.73a2%202%200%200%200%202%200l7-4A2%202%200%200%200%2021%2016V8a2%202%200%200%200-1-1.73l-7-4a2%202%200%200%200-2%200l-7%204A2%202%200%200%200%203%208v8a2%202%200%200%200%201%201.73z%22%2F%3E%3Cpath%20d%3D%22M12%2022V12%22%2F%3E%3Cpolyline%20points%3D%223.29%207%2012%2012%2020.71%207%22%2F%3E%3Cpath%20d%3D%22m7.5%204.27%209%205.15%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="446" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 5: Quality Inspection -->\n    <mxCell id="8" value="&lt;b&gt;Quality &amp;amp; Compliance Check&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Expiry, labelling, batch &amp;amp; regulatory&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#5B21B6;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238B5CF6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20width%3D%228%22%20height%3D%224%22%20x%3D%228%22%20y%3D%222%22%20rx%3D%221%22%20ry%3D%221%22%2F%3E%3Cpath%20d%3D%22M16%204h2a2%202%200%200%201%202%202v14a2%202%200%200%201-2%202H6a2%202%200%200%201-2-2V6a2%202%200%200%201%202-2h2%22%2F%3E%3Cpath%20d%3D%22m9%2014%202%202%204-4%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="550" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 5a: QC Fail Decision -->\n    <mxCell id="9" value="&lt;b&gt;◇ QC Passed?&lt;/b&gt;" style="rhombus;whiteSpace=wrap;html=1;fontStyle=1;shadow=1;fontFamily=Inter;fontSize=13;fillColor=#FFF4E0;strokeColor=#F59E0B;fontColor=#92580A;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="490" y="654" width="160" height="90" as="geometry" />\n    </mxCell>\n\n    <!-- QC Fail: Return to Supplier -->\n    <mxCell id="10" value="&lt;b&gt;Return to Supplier&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#9B1C1C&quot;&gt;Raise claim &amp;amp; reject batch&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#9B1C1C;strokeWidth=2;fillColor=#FDEBEC;strokeColor=#EF4444;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23EF4444%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%2F%3E%3Cpath%20d%3D%22m15%209-6%206%22%2F%3E%3Cpath%20d%3D%22m9%209%206%206%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="240" y="664" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 6: Warehousing &amp; Storage -->\n    <mxCell id="11" value="&lt;b&gt;Warehousing &amp;amp; Storage&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Temperature-controlled, SKU slotting&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cellipse%20cx%3D%2212%22%20cy%3D%225%22%20rx%3D%229%22%20ry%3D%223%22%2F%3E%3Cpath%20d%3D%22M3%205V19A9%203%200%200%200%2021%2019V5%22%2F%3E%3Cpath%20d%3D%22M3%2012A9%203%200%200%200%2021%2012%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="40" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 7: Pick &amp; Pack -->\n    <mxCell id="12" value="&lt;b&gt;Pick &amp;amp; Pack&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Scan, pick, brand pack &amp;amp; label&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%233B82F6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M21%208a2%202%200%200%200-1-1.73l-7-4a2%202%200%200%200-2%200l-7%204A2%202%200%200%200%203%208v8a2%202%200%200%200%201%201.73l7%204a2%202%200%200%200%202%200l7-4A2%202%200%200%200%2021%2016Z%22%2F%3E%3Cpath%20d%3D%22m3.3%207%208.7%205%208.7-5%22%2F%3E%3Cpath%20d%3D%22M12%2022V12%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="144" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 8: Customs / Documentation (if export) -->\n    <mxCell id="13" value="&lt;b&gt;Customs &amp;amp; Documentation&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Invoice, COO, safety data sheet&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F766E;strokeWidth=2;fillColor=#E3F6F5;strokeColor=#14B8A6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2314B8A6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M6%2022a2%202%200%200%201-2-2V4a2%202%200%200%201%202-2h8a2.4%202.4%200%200%201%201.704.706l3.588%203.588A2.4%202.4%200%200%201%2020%208v12a2%202%200%200%201-2%202z%22%2F%3E%3Cpath%20d%3D%22M14%202v5a1%201%200%200%200%201%201h5%22%2F%3E%3Cpath%20d%3D%22M10%209H8%22%2F%3E%3Cpath%20d%3D%22M16%2013H8%22%2F%3E%3Cpath%20d%3D%22M16%2017H8%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="248" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 9: Carrier Selection &amp; Dispatch -->\n    <mxCell id="14" value="&lt;b&gt;Carrier Selection &amp;amp; Dispatch&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Road / air / courier assigned&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14%2018V6a2%202%200%200%200-2-2H4a2%202%200%200%200-2%202v11a1%201%200%200%200%201%201h2%22%2F%3E%3Cpath%20d%3D%22M15%2018H9%22%2F%3E%3Cpath%20d%3D%22M19%2018h2a1%201%200%200%200%201-1v-3.65a1%201%200%200%200-.22-.624l-3.48-4.35A1%201%200%200%200%2017.52%208H14%22%2F%3E%3Ccircle%20cx%3D%2217%22%20cy%3D%2218%22%20r%3D%222%22%2F%3E%3Ccircle%20cx%3D%227%22%20cy%3D%2218%22%20r%3D%222%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="352" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 10: Real-Time Tracking -->\n    <mxCell id="15" value="&lt;b&gt;Real-Time Shipment Tracking&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;GPS, tracking portal, client alerts&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%233B82F6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%2010c0%204.993-5.539%2010.193-7.399%2011.799a1%201%200%200%201-1.202%200C9.539%2020.193%204%2014.993%204%2010a8%208%200%200%201%2016%200%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2210%22%20r%3D%223%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="456" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 11: Last Mile Delivery -->\n    <mxCell id="16" value="&lt;b&gt;Last Mile Delivery&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Delivered to retailer / end customer&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2334A881%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14.536%2021.686a.5.5%200%200%200%20.937-.024l6.5-19a.496.496%200%200%200-.635-.635l-19%206.5a.5.5%200%200%200-.024.937l7.93%203.18a2%202%200%200%201%201.112%201.11z%22%2F%3E%3Cpath%20d%3D%22m21.854%202.147-10.94%2010.939%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="560" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 12: Proof of Delivery -->\n    <mxCell id="17" value="&lt;b&gt;Proof of Delivery (POD)&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Digital signature / photo captured&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#5B21B6;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%238B5CF6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M21.801%2010A10%2010%200%201%201%2017%203.335%22%2F%3E%3Cpath%20d%3D%22m9%2011%203%203L22%204%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="664" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 13: Returns Management -->\n    <mxCell id="18" value="&lt;b&gt;Returns Management&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Reverse logistics, inspect &amp;amp; restock&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#92580A;strokeWidth=2;fillColor=#FFF4E0;strokeColor=#F59E0B;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23F59E0B%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%2012a9%209%200%200%201%209-9%209.75%209.75%200%200%201%206.74%202.74L21%208%22%2F%3E%3Cpath%20d%3D%22M21%203v5h-5%22%2F%3E%3Cpath%20d%3D%22M21%2012a9%209%200%200%201-9%209%209.75%209.75%200%200%201-6.74-2.74L3%2016%22%2F%3E%3Cpath%20d%3D%22M8%2016H3v5%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="720" y="664" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- STEP 14: Invoice &amp; Billing -->\n    <mxCell id="19" value="&lt;b&gt;Invoice &amp;amp; Billing&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Generate invoice, logistics cost report&lt;/span&gt;" style="shape=label;rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F766E;strokeWidth=2;fillColor=#E3F6F5;strokeColor=#14B8A6;;image=data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2314B8A6%22%20stroke-width%3D%222.25%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20width%3D%2220%22%20height%3D%2214%22%20x%3D%222%22%20y%3D%225%22%20rx%3D%222%22%2F%3E%3Cline%20x1%3D%222%22%20x2%3D%2222%22%20y1%3D%2210%22%20y2%3D%2210%22%2F%3E%3C%2Fsvg%3E;imageAlign=left;imageVerticalAlign=middle;imageWidth=22;imageHeight=22;spacingLeft=46;" vertex="1" parent="1">\n      <mxGeometry x="465" y="768" width="210" height="64" as="geometry" />\n    </mxCell>\n\n    <!-- END -->\n    <mxCell id="20" value="&lt;b&gt;✅ End&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#34A881;strokeColor=#2E9673;fontColor=#FFFFFF;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="490" y="872" width="150" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- ========== EDGES ========== -->\n\n    <!-- Start → Client Onboarding -->\n    <mxCell id="30" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="2" target="3" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Client Onboarding → Order Received -->\n    <mxCell id="31" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="3" target="4" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Order Received → Stock Available? -->\n    <mxCell id="32" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;fontStyle=1;" edge="1" source="4" target="5" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Stock Available? → No → Replenishment -->\n    <mxCell id="33" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#EF4444;" edge="1" source="5" target="6" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Replenishment → Inbound Goods Receipt -->\n    <mxCell id="34" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="6" target="7" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Stock Available? → Yes → Inbound Goods Receipt -->\n    <mxCell id="35" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#34A881;" edge="1" source="5" target="7" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Inbound Goods Receipt → Quality Check -->\n    <mxCell id="36" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="7" target="8" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Quality Check → QC Passed? -->\n    <mxCell id="37" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="8" target="9" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- QC Passed? → No → Return to Supplier -->\n    <mxCell id="38" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#EF4444;" edge="1" source="9" target="10" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- QC Passed? → Yes → Warehousing -->\n    <mxCell id="39" value="Yes" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#FFFFFF;fontSize=12;fontStyle=1;labelBackgroundColor=#34A881;" edge="1" source="9" target="11" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Warehousing → Pick &amp; Pack -->\n    <mxCell id="40" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="11" target="12" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Pick &amp; Pack → Customs &amp; Documentation -->\n    <mxCell id="41" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="12" target="13" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Customs → Carrier Selection &amp; Dispatch -->\n    <mxCell id="42" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="13" target="14" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Carrier Selection → Real-Time Tracking -->\n    <mxCell id="43" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="14" target="15" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Real-Time Tracking → Last Mile Delivery -->\n    <mxCell id="44" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="15" target="16" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Last Mile Delivery → POD -->\n    <mxCell id="45" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="16" target="17" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- POD → Returns Management -->\n    <mxCell id="46" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="17" target="18" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- POD → Invoice &amp; Billing -->\n    <mxCell id="47" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="17" target="19" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Returns → Invoice &amp; Billing -->\n    <mxCell id="48" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="18" target="19" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Invoice &amp; Billing → End -->\n    <mxCell id="49" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="19" target="20" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n  </root>\n</mxGraphModel>	{"model": "claude-sonnet-4-6", "intent": "generate_diagram"}	2026-08-03 07:56:44.661
cmscyji7a000d5gdolbzghsp9	cmscyhcm000015gdogd4haqhi	user	Create a diagram from the document "Bills _ Billing and Cost Management _ Global.pdf" based on: analys ethis how to reduce the coste as per this	\N	\N	2026-08-03 08:18:46.63
cmscyji7b000f5gdo2l31fyi5	cmscyhcm000015gdogd4haqhi	assistant	Diagram generated. Preview below — click Insert to add to canvas.	<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n  <root>\n    <mxCell id="0" />\n    <mxCell id="1" parent="0" />\n\n    <!-- Title -->\n    <mxCell id="2" value="&lt;b style='font-size:16px;'&gt;AWS Cost Reduction Analysis — June 2026&lt;/b&gt;&lt;br&gt;&lt;span style='font-size:11px;color:#64748B'&gt;Total Bill: USD $151.45 | Account: 965526028654&lt;/span&gt;" style="text;html=1;align=center;verticalAlign=middle;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;" vertex="1" parent="1">\n      <mxGeometry x="200" y="20" width="769" height="50" as="geometry" />\n    </mxCell>\n\n    <!-- START -->\n    <mxCell id="3" value="&lt;b&gt;▶ AWS Bill Received&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#D1FAE5;strokeColor=#34A881;fontColor=#065F46;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="510" y="90" width="150" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- Total Bill Card -->\n    <mxCell id="4" value="&lt;b&gt;💰 Total Bill: $151.45&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Jun 1–30, 2026 | EMEA SARL&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="445" y="188" width="280" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- Top Costs Header -->\n    <mxCell id="5" value="&lt;b&gt;🔍 Identify Top Cost Drivers&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Break down by service &amp; region&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1">\n      <mxGeometry x="445" y="322" width="280" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- Lightsail Card -->\n    <mxCell id="6" value="&lt;b&gt;🖥️ Lightsail: $84.76&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;56% of total | +14.2% MoM&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#FDEBEC;strokeColor=#EF4444;" vertex="1" parent="1">\n      <mxGeometry x="140" y="460" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- WorkMail Card -->\n    <mxCell id="7" value="&lt;b&gt;📧 WorkMail: $19.83&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;13% of total bill&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#FFF4E0;strokeColor=#F59E0B;" vertex="1" parent="1">\n      <mxGeometry x="445" y="460" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- WAF Card -->\n    <mxCell id="8" value="&lt;b&gt;🛡️ AWS WAF: $8.00&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;5% of total | EU Stockholm&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;" vertex="1" parent="1">\n      <mxGeometry x="750" y="460" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- Lightsail Actions -->\n    <mxCell id="9" value="&lt;b&gt;⚙️ Lightsail Optimisation&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Right-size or migrate to EC2&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#FDEBEC;strokeColor=#EF4444;" vertex="1" parent="1">\n      <mxGeometry x="60" y="600" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <mxCell id="10" value="&lt;b&gt;📉 Downgrade Lightsail Plan&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Match instance to actual load&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="60" y="700" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- WorkMail Actions -->\n    <mxCell id="11" value="&lt;b&gt;👥 Audit WorkMail Users&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Remove unused mailboxes&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#FFF4E0;strokeColor=#F59E0B;" vertex="1" parent="1">\n      <mxGeometry x="380" y="600" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <mxCell id="12" value="&lt;b&gt;🔄 Consider Alternative Mail&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;e.g. Microsoft 365 or Google&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E8F1FE;strokeColor=#3B82F6;" vertex="1" parent="1">\n      <mxGeometry x="380" y="700" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- WAF Actions -->\n    <mxCell id="13" value="&lt;b&gt;🛡️ Review WAF Rules&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Remove redundant ACL rules&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#F1EBFB;strokeColor=#8B5CF6;" vertex="1" parent="1">\n      <mxGeometry x="700" y="600" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <mxCell id="14" value="&lt;b&gt;📌 Consolidate WAF WebACLs&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;Share ACLs across resources&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E3F6F5;strokeColor=#14B8A6;" vertex="1" parent="1">\n      <mxGeometry x="700" y="700" width="260" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- Cost Monitoring Card -->\n    <mxCell id="15" value="&lt;b&gt;📊 Enable Cost Monitoring&lt;/b&gt;&lt;br&gt;&lt;span style=&quot;font-size:11px;color:#64748B&quot;&gt;AWS Budgets &amp; Cost Explorer&lt;/span&gt;" style="rounded=1;arcSize=18;whiteSpace=wrap;html=1;align=left;spacingLeft=14;verticalAlign=middle;shadow=1;fontFamily=Inter;fontSize=13;fontColor=#0F172A;strokeWidth=2;fillColor=#E6F7F0;strokeColor=#34A881;" vertex="1" parent="1">\n      <mxGeometry x="445" y="810" width="280" height="74" as="geometry" />\n    </mxCell>\n\n    <!-- END -->\n    <mxCell id="16" value="&lt;b&gt;✅ Estimated Savings: ~$40-60/mo&lt;/b&gt;" style="rounded=1;arcSize=50;whiteSpace=wrap;html=1;shadow=1;fontFamily=Inter;fontStyle=1;fillColor=#34A881;strokeColor=#2E9673;fontColor=#FFFFFF;strokeWidth=2;" vertex="1" parent="1">\n      <mxGeometry x="470" y="934" width="230" height="48" as="geometry" />\n    </mxCell>\n\n    <!-- EDGES -->\n    <!-- Start to Total Bill -->\n    <mxCell id="17" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;fontColor=#334155;fontSize=12;" edge="1" source="3" target="4" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Total Bill to Identify -->\n    <mxCell id="18" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="4" target="5" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Identify to Lightsail -->\n    <mxCell id="19" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#EF4444;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="5" target="6" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Identify to WorkMail -->\n    <mxCell id="20" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#F59E0B;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="5" target="7" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Identify to WAF -->\n    <mxCell id="21" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#8B5CF6;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="5" target="8" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Lightsail to action 1 -->\n    <mxCell id="22" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#EF4444;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="6" target="9" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Action 1 to Action 2 -->\n    <mxCell id="23" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#34A881;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="9" target="10" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- WorkMail to action 1 -->\n    <mxCell id="24" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#F59E0B;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="7" target="11" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- WorkMail action 1 to 2 -->\n    <mxCell id="25" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#3B82F6;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="11" target="12" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- WAF to action 1 -->\n    <mxCell id="26" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#8B5CF6;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="8" target="13" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- WAF action 1 to 2 -->\n    <mxCell id="27" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#14B8A6;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="13" target="14" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- All merge to Cost Monitoring -->\n    <mxCell id="28" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="10" target="15" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="29" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="12" target="15" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <mxCell id="30" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#94A3B8;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="14" target="15" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n    <!-- Cost Monitoring to End -->\n    <mxCell id="31" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#34A881;strokeWidth=2;endArrow=block;endFill=1;" edge="1" source="15" target="16" parent="1">\n      <mxGeometry relative="1" as="geometry" />\n    </mxCell>\n\n  </root>\n</mxGraphModel>	{"model": "claude-sonnet-4-6", "intent": "generate_diagram"}	2026-08-03 08:18:46.631
cmscyjmuk000h5gdojx1tkzm0	cmscyhcm000015gdogd4haqhi	user	what happend	\N	\N	2026-08-03 08:18:52.653
cmscwo60s0001i8zivd7wh8xy	cmscvli4g000158zfi0gtyuoe	user	i wan end to end service flow can u regenrte ths	\N	\N	2026-08-03 07:26:24.893
cmscyhyon00035gdolwy6ct4g	cmscyhcm000015gdogd4haqhi	document	\n\nBilling period\nJun 1 - Jun 30, 2026\nAccount ID\n965526028654\nBill status\nIssued\nBill issued\nJul 1, 2026\nDate printed\nJul 31, 2026\nAWS bill summary\nService providerTotal in invoice currencyTotal in USD\nAmazon Web Services EMEA SARLUSD 151.45USD 151.45\nGrand total:USD 151.45\nPayment information(0)Total received paymentsUSD 0.00\nNo data to display.\nHighest cost by service provider\nAmazon Web Services EMEA SARL\nHighest service spend\nService nameLightsail\nHighest service spendUSD 84.76\nTrend compared to prior month 14.2%\nHighest AWS Region spend\nRegion nameEU (Stockholm)\nHighest AWS Region spendUSD 92.91\nTrend compared to prior month 17.1%\nCharges by service\nAmazon Web Services EMEA SARL(15)Total pre-taxUSD 121.16\nDescriptionUsage QuantityAmount in USD\nLightsailUSD 84.76\nAsia Pacific (Mumbai)USD 7.37\nAmazon Lightsail APS3-SnapshotUsageUSD 0.60\n$0.05 / GB-Month of stored snapshot data - Asia Pacific  (Mumbai)12.075 GB-MoUSD 0.60\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of India (50GB bundle)1.036 GBUSD 0.00\nAmazon Lightsail ContainerSvc:Nano-0.25CPU-0.5GBUSD 6.77\n$0.0094 / Hour for Container Service Node of Power-Nano(0.25CPU-0.5GB) - Asia Pacific\n(Mumbai)\n720 HrsUSD 6.77\nAsia Pacific (Singapore)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Asia Pacific  (50GB bundle)0.513 GBUSD 0.00\nAsia Pacific (Sydney)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Australia (50GB bundle)0.008 GBUSD 0.00\nAsia Pacific (Tokyo)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Japan (50GB bundle)0.092 GBUSD 0.00\nCanada (Central)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Canada (50GB bundle)0.058 GBUSD 0.00\n\nDescriptionUsage QuantityAmount in USD\nEU (Frankfurt)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Middle East (50GB bundle)0.046 GBUSD 0.00\nEU (Ireland)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of Europe (50GB bundle)7.361 GBUSD 0.00\nEU (London)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of South Africa (50GB bundle)0.028 GBUSD 0.00\nEU (Stockholm)USD 77.39\nAmazon Lightsail Bundle:2GBUSD 34.82\n$0.01612 / Hour of 2GB bundle Instance including public IPv4 address2,160 HrsUSD 34.82\nAmazon Lightsail Bundle:8GBUSD 42.57\n$0.05913 / Hour of 8GB bundle Instance including public IPv4 address720 HrsUSD 42.57\nAmazon Lightsail EUN1-TotalDataXfer-Out-BytesUSD 0.00\n$0.00 / GB - data transfer out for EU (Stockholm)13.391 GBUSD 0.00\nGlobalUSD 0.00\nAmazon Lightsail EUN1-TotalDataXfer-In-BytesUSD 0.00\n$0.00 / GB - data transfer in7.271 GBUSD 0.00\nSouth America (Sao Paulo)USD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of South America (50GB bundle)0.056 GBUSD 0.00\nUS East (N. Virginia)USD 0.00\nAmazon Lightsail CDN-Bundle:50GB_FreeTrialUSD 0.00\n$0.00 / CDN Bundle: 50GB Free Trial4 BundlesUSD 0.00\nAmazon Lightsail CDN:50GB-TotalDataXfer-OutUSD 0.00\n$0.00 / GB total CDN data transfer out of United States (50GB bundle)1.896 GBUSD 0.00\nWorkMailUSD 19.83\nEU (Ireland)USD 19.83\nAmazonWorkMail EUW1-WorkMail-NormalTier-UserHrsUSD 19.83\n$4 per user per month in the EUW1 region4.957 User-MoUSD 19.83\nWAFUSD 8.00\nEU (Stockholm)USD 8.00\nAWS WAF EUN1-RuleV2USD 3.00\n$1.00 per rule created (prorated hourly)3 MonthUSD 3.00\nAWS WAF EUN1-WebACLV2USD 5.00\n$5.00 per web ACL created (prorated hourly)1 MonthUSD 5.00\nVirtual Private CloudUSD 3.60\nEU (Stockholm)USD 3.60\nAmazon Virtual Private Cloud Public IPv4 AddressesUSD 3.60\n$0.005 per Idle public IPv4 address per hour720 HrsUSD 3.60\nElastic Compute CloudUSD 2.11\nEU (Stockholm)USD 2.11\nEBSUSD 2.11\n$0.0475 per GB-Month of snapshot data stored - EU (Stockholm)9.364 GB-MoUSD 0.44\n$0.1045 per GB-month of General Purpose SSD (gp2) provisioned storage - EU (Stockholm)16 GB-MoUSD 1.67\nRelational Database ServiceUSD 1.63\nEU (Stockholm)USD 1.63\nAmazon Relational Database Service Backup StorageUSD 1.62\nUSD 0.09 per GB-month of backup storage exceeding free allocation17.959 GB-MoUSD 1.62\nAmazon Relational Database Service for Aurora MySQLUSD 0.01\nUSD 0.02 per GB-month of backup storage exceeding free allocation for Aurora MySQL0.324 GB-MoUSD 0.01\nRoute 53USD 1.04\nAnyUSD 1.04\nAmazon Route 53 DNS-QueriesUSD 0.04\n$0.40 per 1,000,000 queries for the fir st 1 Billion queries110,151 QueriesUSD 0.04\nAmazon Route 53 HostedZoneUSD 1.00\n$0.50 per Hosted Zone for the fir st 25 Hosted Zones2 HostedZoneUSD 1.00\nAmazon Route 53 Intra-AWS-DNS-QueriesUSD 0.00\nQueries to Alias records are free of charge100,945 QueriesUSD 0.00\nSimple Storage ServiceUSD 0.18\nAnyUSD 0.00\nAmazon Simple Storage Service GeneralPurposeBucketsUSD 0.00\n$0.00 per bucket / month for the fir st 2000 general purpose buckets in your account0.708 Bucket-MoUSD 0.00\nAsia Pacific (Mumbai)USD 0.00\nAmazon Simple Storage Service APS3-Requests-Tier1USD 0.00\n$0.005 per 1,000 PUT, COPY, POST, or LIST requests1 RequestsUSD 0.00\nEU (Frankfurt)USD 0.00\nAmazon Simple Storage Service EUC1-Requests-Tier1USD 0.00\n$0.0054 per 1,000 PUT, COPY, POST, or LIST requests2 RequestsUSD 0.00\nEU (Ireland)USD 0.00\nAmazon Simple Storage Service EU-Requests-Tier1USD 0.00\n$0.005 per 1,000 PUT, COPY, POST, or LIST requests1 RequestsUSD 0.00\nEU (Stockholm)USD 0.18\nAmazon Simple Storage Service EUN1-Requests-Tier1USD 0.02\n$0.005 per 1,000 PUT, COPY, POST, or LIST requests4,721 RequestsUSD 0.02\nAmazon Simple Storage Service EUN1-Requests-Tier2USD 0.00\n$0.004 per 10,000 GET and all other requests4,744 RequestsUSD 0.00\n\nDescriptionUsage QuantityAmount in USD\nAmazon Simple Storage Service EUN1-TimedStorage-ByteHrsUSD 0.16\n$0.023 per GB - fir st 50 TB / month of storage used7.144 GB-MoUSD 0.16\nUS East (N. Virginia)USD 0.00\nAmazon Simple Storage Service Requests-Tier1USD 0.00\n$0.005 per 1,000 PUT, COPY, POST, or LIST requests32 RequestsUSD 0.00\nAmazon Simple Storage Service Requests-Tier2USD 0.00\n$0.004 per 10,000 GET and all other requests168 RequestsUSD 0.00\nAmazon Simple Storage Service TimedStorage-ByteHrsUSD 0.00\n$0.023 per GB - fir st 50 TB / month of storage used0.009 GB-MoUSD 0.00\nAmplifyUSD 0.01\nUS East (N. Virginia)USD 0.01\nAWS Amplify USE1-DataStorageUSD 0.01\n$0.023 per GB build artifacts stored0.457 GigaBytesUSD 0.01\nBandwidthUSD 0.00\n$0.15 per GB served (data transfer out)0 GigaBytesUSD 0.00\nChime FeaturesUSD 0.00\nUS East (N. Virginia)USD 0.00\nAmazon Chime Features USE1-SDK-Messaging-StorageUSD 0.00\n$5 per GB/mo storage.0 GigaBytesUSD 0.00\nCloudFrontUSD 0.00\nAfrica (Cape Town)USD 0.00\nAmazon CloudFront ZA-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier11 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.011 GBUSD 0.00\nAsia Pacific (Mumbai)USD 0.00\nAmazon CloudFront IN-Requests-HTTPS-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1 RequestsUSD 0.00\nAmazon CloudFront IN-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier2 RequestsUSD 0.00\nAmazon CloudFront IN-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier27 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.011 GBUSD 0.00\nAsia Pacific (Singapore)USD 0.00\nAmazon CloudFront AP-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier151 RequestsUSD 0.00\nAmazon CloudFront AP-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier188 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.006 GBUSD 0.00\nCanada (Central)USD 0.00\nAmazon CloudFront CA-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier870 RequestsUSD 0.00\nAmazon CloudFront CA-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier876 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.001 GBUSD 0.00\nEU (Ireland)USD 0.00\nAmazon CloudFront EU-Requests-HTTP-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier2 RequestsUSD 0.00\nAmazon CloudFront EU-Requests-HTTPS-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier69 RequestsUSD 0.00\nAmazon CloudFront EU-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier400 RequestsUSD 0.00\nAmazon CloudFront EU-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1,721 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.155 GBUSD 0.00\nMiddle East (Bahrain)USD 0.00\nAmazon CloudFront ME-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier6 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.006 GBUSD 0.00\nSouth America (Sao Paulo)USD 0.00\nAmazon CloudFront SA-Requests-HTTP-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1 RequestsUSD 0.00\nAmazon CloudFront SA-Requests-HTTPS-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1 RequestsUSD 0.00\nAmazon CloudFront SA-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier305 RequestsUSD 0.00\nAmazon CloudFront SA-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier342 RequestsUSD 0.00\nBandwidthUSD 0.00\n$0.000 per GB - data transfer out under the global monthly free tier0.006 GBUSD 0.00\nUS East (N. Virginia)USD 0.00\nAmazon CloudFront US-Requests-HTTP-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1 RequestsUSD 0.00\nAmazon CloudFront US-Requests-HTTPS-ProxyUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier32 RequestsUSD 0.00\nAmazon CloudFront US-Requests-Tier1USD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier645 RequestsUSD 0.00\nAmazon CloudFront US-Requests-Tier2-HTTPSUSD 0.00\n$0.000 per request - HTTP or HTTPS under the global monthly free tier1,059 RequestsUSD 0.00\nBandwidthUSD 0.00\n\nDescriptionUsage QuantityAmount in USD\n$0.000 per GB - data transfer out under the global monthly free tier0.017 GBUSD 0.00\nCloudWatchUSD 0.00\nUS East (N. Virginia)USD 0.00\nAmazonCloudWatch USE1-TimedStorage-ByteHrsUSD 0.00\nFirst 5GB-mo per month of logs storage is free.0 GB-MoUSD 0.00\nFirst 5GB-mo per month of logs storage is free.0 GB-MoUSD 0.00\nData TransferUSD 0.00\nEU (Stockholm)USD 0.00\nAWS Data Transfer EUN1-CloudFront-Out-BytesUSD 0.00\nUSD 0.0 per GB for CloudFront-Out-Bytes in EU (Stockholm)0.145 GBUSD 0.00\nUS East (N. Virginia)USD 0.00\nAWS Data Transfer USE1-APS3-AWS-Out-BytesUSD 0.00\n$0.02 per GB - US East (Northern Virginia) data transfer to Asia Pacific (Mumbai)0 GBUSD 0.00\nAWS Data Transfer USE1-EU-AWS-Out-BytesUSD 0.00\n$0.02 per GB - US East (Northern Virginia) data transfer to EU (Ireland)0 GBUSD 0.00\nAWS Data Transfer USE1-EUC1-AWS-Out-BytesUSD 0.00\n$0.02 per GB - US East (Northern Virginia) data transfer to EU (Germany)0 GBUSD 0.00\nAWS Data Transfer USE1-EUN1-AWS-Out-BytesUSD 0.00\nUSD 0.02 per GB for EUN1-AWS-Out-Bytes in EU (Stockholm)0 GBUSD 0.00\nGlueUSD 0.00\nAsia Pacific (Mumbai)USD 0.00\nAWS Glue RequestUSD 0.00\n$0 for AWS Glue Data Catalog requests under the free tier60 RequestUSD 0.00\nEU (Frankfurt)USD 0.00\nAWS Glue RequestUSD 0.00\n$0 for AWS Glue Data Catalog requests under the free tier60 RequestUSD 0.00\nEU (Ireland)USD 0.00\nAWS Glue RequestUSD 0.00\n$0 for AWS Glue Data Catalog requests under the free tier60 RequestUSD 0.00\nEU (Stockholm)USD 0.00\nAWS Glue RequestUSD 0.00\n$0 for AWS Glue Data Catalog requests under the free tier60 RequestUSD 0.00\nUS East (N. Virginia)USD 0.00\nAWS Glue RequestUSD 0.00\n$0 for AWS Glue Data Catalog requests under the free tier61 RequestUSD 0.00\nKey Management ServiceUSD 0.00\nAsia Pacific (Mumbai)USD 0.00\nAWS Key Management Service ap-south-1-KMS-RequestsUSD 0.00\n$0.00 per request - Monthly Global Free Tier for KMS requests6 RequestsUSD 0.00\nEU (Ireland)USD 0.00\nAWS Key Management Service eu-west-1-KMS-RequestsUSD 0.00\n$0.00 per request - Monthly Global Free Tier for KMS requests6 RequestsUSD 0.00\nEU (Stockholm)USD 0.00\nAWS Key Management Service eu-north-1-KMS-RequestsUSD 0.00\n$0.00 per request - Monthly Global Free Tier for KMS requests20 RequestsUSD 0.00\nUS East (N. Virginia)USD 0.00\nAWS Key Management Service us-east-1-KMS-RequestsUSD 0.00\n$0.00 per request - Monthly Global Free Tier for KMS requests6 RequestsUSD 0.00\nTotal taxUSD 30.29\nCharges by account(0)Total post-taxUSD 0.00\nNo data to display.\nInvoices\nAmazon Web Services EMEA SARL(1)Total invoiced chargesUSD 151.45\nCharge typeDocument typeInvoice IDInvoice date\n(UTC)\nTotal in USD\nUsageInvoiceEUINSE26-25514607/01/2026USD 151.45\nTax Invoices and Additional Documents\n\nNo data to display.\nSavings(0)Total savingsUSD 0.00\nNo data to display.\nTaxes by service\nAmazon Web Services EMEA SARL(8)Total taxUSD 30.29\nService namePost-tax chargesPre-tax chargesTaxes\nLightsailUSD 105.95USD 84.76USD 21.19\nWorkMailUSD 24.79USD 19.83USD 4.96\nWAFUSD 10.00USD 8.00USD 2.00\nVirtual Private CloudUSD 4.50USD 3.60USD 0.90\nElastic Compute CloudUSD 2.64USD 2.11USD 0.53\nRelational Database ServiceUSD 2.04USD 1.63USD 0.41\nRoute 53USD 1.30USD 1.04USD 0.26\nSimple Storage ServiceUSD 0.22USD 0.18USD 0.04\nUsage and recurring charges for this statement period will be charged on your next billing date. Estimated charges shown on this\npage, or shown on any notifications that we send to you, may differ from your actual charges for this statement period. This is\nbecause estimated charges presented on this page do not include usage charges accrued during this statement period after the\ndate you view this page. Similarly, information about estimated charges sent to you in a notification do not include usage charges\naccrued during this statement period after the date we send you the notification. One-time fees and subscription charges are\nassessed separately from usage and reoccurring charges, on the date that they occur. The charges on this page exclude taxes,\nunless it is listed as a separate line item. To access your tax information, contact your AWS Organization’s management owner.	\N	{"fileName": "Bills _ Billing and Cost Management _ Global.pdf", "extractedAt": "2026-08-03T08:17:34.679Z"}	2026-08-03 08:17:34.68
cmscyhyop00055gdo3joflvyr	cmscyhcm000015gdogd4haqhi	user	analys ethis how to reduce the coste as per this	\N	\N	2026-08-03 08:17:34.681
cmscyjre3000j5gdon876s29h	cmscyhcm000015gdogd4haqhi	assistant	Apologies if that was unclear!\n\nMy system automatically generated a diagram for you based on the AWS billing document. It's designed to visualize the cost breakdown you asked me to analyze.\n\nYou should see a diagram preview directly above our conversation. This diagram illustrates:\n*   Your highest cost services (Lightsail, WorkMail, WAF).\n*   Spending by region, especially in EU (Stockholm).\n*   Detailed charges for Lightsail instances and other services.\n\nYou can click on the diagram thumbnail in the chat to see a larger preview and then click '+ Insert into Canvas' to add it to your working area.\n\nDid you see the preview? Let me know if you can't find it!	\N	{"message": "Apologies if that was unclear!\\n\\nMy system automatically generated a diagram for you based on the AWS billing document. It's designed to visualize the cost breakdown you asked me to analyze.\\n\\nYou should see a diagram preview directly above our conversation. This diagram illustrates:\\n*   Your highest cost services (Lightsail, WorkMail, WAF).\\n*   Spending by region, especially in EU (Stockholm).\\n*   Detailed charges for Lightsail instances and other services.\\n\\nYou can click on the diagram thumbnail in the chat to see a larger preview and then click '+ Insert into Canvas' to add it to your working area.\\n\\nDid you see the preview? Let me know if you can't find it!", "drawioXml": null, "openTemplate": false, "templateName": null, "suggestedSteps": []}	2026-08-03 08:18:58.539
cmscyk7dv000p5gdo0348uc5q	cmscyhcm000015gdogd4haqhi	user	what happend	\N	\N	2026-08-03 08:19:19.267
cmscyk7dw000r5gdonosy1avr	cmscyhcm000015gdogd4haqhi	assistant	Diagram generated. Preview below — click Insert to add to canvas.	<mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">\n  <root>\n    <mxCell id="0" />\n    <mxCell id="1" parent="0" />\n    <mxCell id="2" value="<b>AWS Cost Breakdown: June 2026</b>" style="text;html=1;align=center;verticalAlign=middle;fontStyle=1;fontFamily=Inter;fontSize=18;fontColor=#334155;" vertex="1" parent="1">\n      <mxGeometry x="320" y="60" width="340" height="30" as="geometry" />\n    </mxCell>\n    <mxCell id="3" value="EU (Stockholm)&lt;br&gt;$92.91" style="whiteSpace=wrap;html=1;fillColor=#E6F7F0;strokeColor=#34A881;fontFamily=Inter;fontSize=13;fontColor=#0E5A43;rounded=1;shadow=1;strokeWidth=2;align=center;verticalAlign=bottom;spacingLeft=6;spacingRight=6;" vertex="1" parent="1">\n      <mxGeometry x="120" y="250" width="90" height="250" as="geometry" />\n    </mxCell>\n    <mxCell id="4" value="Lightsail&lt;br&gt;$84.76" style="whiteSpace=wrap;html=1;fillColor=#E8F1FE;strokeColor=#3B82F6;fontFamily=Inter;fontSize=13;fontColor=#1E3A8A;rounded=1;shadow=1;strokeWidth=2;align=center;verticalAlign=bottom;spacingLeft=6;spacingRight=6;" vertex="1" parent="1">\n      <mxGeometry x="240" y="272" width="90" height="228" as="geometry" />\n    </mxCell>\n    <mxCell id="5" value="Other Services&lt;br&gt;$38.86" style="whiteSpace=wrap;html=1;fillColor=#F1EBFB;strokeColor=#8B5CF6;fontFamily=Inter;fontSize=13;fontColor=#5B21B6;rounded=1;shadow=1;strokeWidth=2;align=center;verticalAlign=bottom;spacingLeft=6;spacingRight=6;" vertex="1" parent="1">\n      <mxGeometry x="360" y="395" width="90" height="105" as="geometry" />\n    </mxCell>\n    <mxCell id="6" value="WorkMail&lt;br&gt;$19.83" style="whiteSpace=wrap;html=1;fillColor=#E3F6F5;strokeColor=#14B8A6;fontFamily=Inter;fontSize=13;fontColor=#0F766E;rounded=1;shadow=1;strokeWidth=2;align=center;verticalAlign=bottom;spacingLeft=6;spacingRight=6;" vertex="1" parent="1">\n      <mxGeometry x="480" y="447" width="90" height="53" as="geometry" />\n    </mxCell>\n    <mxCell id="7" value="AWS WAF&lt;br&gt;$8.00" style="whiteSpace=wrap;html=1;fillColor=#FFF4E0;strokeColor=#F59E0B;fontFamily=Inter;fontSize=13;fontColor=#92580A;rounded=1;shadow=1;strokeWidth=2;align=center;verticalAlign=bottom;spacingLeft=6;spacingRight=6;" vertex="1" parent="1">\n      <mxGeometry x="600" y="479" width="90" height="21" as="geometry" />\n    </mxCell>\n    <mxCell id="8" value="" style="whiteSpace=wrap;html=1;fillColor=#94A3B8;strokeColor=#94A3B8;" vertex="1" parent="1">\n      <mxGeometry x="90" y="500" width="630" height="2" as="geometry" />\n    </mxCell>\n    <mxCell id="9" value="Total Bill: $151.45" style="text;html=1;align=center;verticalAlign=middle;fontStyle=1;fontFamily=Inter;fontSize=14;fontColor=#334155;" vertex="1" parent="1">\n      <mxGeometry x="320" y="110" width="160" height="30" as="geometry" />\n    </mxCell>\n  </root>\n</mxGraphModel>	{"model": "gemini-2.5-flash", "intent": "generate_diagram"}	2026-08-03 08:19:19.268
cmscwo9v70003i8zio05k99ya	cmscvli4g000158zfi0gtyuoe	assistant	Absolutely! I can regenerate that for you, focusing specifically on the **end-to-end service flow** of a cosmetic logistics operation, from the moment a client places an order to final delivery and beyond.\n\nThis diagram will illustrate the key steps involved in providing cosmetic logistics services:\n\n*   **Client Order Processing:** How orders are received and managed.\n*   **Warehouse & Fulfillment:** The stages of handling products from storage to packaging.\n*   **Transportation & Delivery:** The movement and delivery of goods.\n*   **Post-Delivery Services:** Including returns and customer support.\n\nI'll generate this diagram for you — click ⚡ Generate below to use 1 credit.	\N	{"message": "Absolutely! I can regenerate that for you, focusing specifically on the **end-to-end service flow** of a cosmetic logistics operation, from the moment a client places an order to final delivery and beyond.\\n\\nThis diagram will illustrate the key steps involved in providing cosmetic logistics services:\\n\\n*   **Client Order Processing:** How orders are received and managed.\\n*   **Warehouse & Fulfillment:** The stages of handling products from storage to packaging.\\n*   **Transportation & Delivery:** The movement and delivery of goods.\\n*   **Post-Delivery Services:** Including returns and customer support.\\n\\nI'll generate this diagram for you — click ⚡ Generate below to use 1 credit.", "drawioXml": null, "openTemplate": false, "templateName": null, "suggestedSteps": []}	2026-08-03 07:26:29.876
\.


--
-- Data for Name: apps; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.apps (id, legacy_id, app_name, db_name, created_at, updated_at) FROM stdin;
cmpqgy2df0005ch6ohnmvx4ui	1	valuechart_enterprise	ent_value_chart	2026-05-29 05:15:52.324	\N
cmpqgy2dh0006ch6otfkhrb4o	2	valuechart_individual	ind_value_chart	2026-05-29 05:15:52.326	\N
\.


--
-- Data for Name: chat_files; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_files (id, message_id, file_name, file_type, file_size, file_path, created_at) FROM stdin;
\.


--
-- Data for Name: chat_group_users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_group_users (id, user_id, group_id, chat_clear, last_read_at, created_at, updated_at) FROM stdin;
cmsjzj6090003p0h7ei0beapw	cmshogbjz0006unig73ya73rp	cmsjzj6060001p0h7zwm76r0q	\N	\N	\N	\N
cmsjzj6090002p0h7ih4n39wn	cmrxp6xwg0000d8j5pnl9zop9	cmsjzj6060001p0h7zwm76r0q	\N	2026-08-08 06:20:54.62	\N	\N
cmsjzssx2000dp0h7y7zldlvf	cmrxp6xwg0000d8j5pnl9zop9	cmsjzssx0000cp0h72vvxfbzj	\N	\N	2026-08-08 06:28:23.267	\N
cmsjztw7n000gp0h7m2fv597l	cmshogbjz0006unig73ya73rp	cmsjzssx0000cp0h72vvxfbzj	\N	\N	2026-08-08 06:29:14.195	\N
cmsk0azye0008mn9o9plasxyi	cmrxp6xwg0000d8j5pnl9zop9	cmsk0azyd0007mn9o1b5tp0at	\N	2026-08-08 06:45:07.108	\N	\N
cmsj694cr00023dmdw0rdq6qh	cmshogbjz0006unig73ya73rp	cmsj031th0006ukjr9y8bczs7	\N	2026-08-08 06:52:39.009	2026-08-07 16:41:16.107	\N
cmsk0azye0009mn9ocx4ek1oi	cmshogbjz0006unig73ya73rp	cmsk0azyd0007mn9o1b5tp0at	\N	2026-08-08 06:52:46.916	\N	\N
cmsj031to0007ukjrhbhryc92	cmrxp6xwg0000d8j5pnl9zop9	cmsj031th0006ukjr9y8bczs7	\N	2026-08-08 07:00:33.03	2026-08-07 13:48:35.186	\N
\.


--
-- Data for Name: chat_groups; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_groups (id, legacy_id, legacy_source, title, picture, user_id, workspace_id, company_id, flow_id, flow_item_id, app_type, app_context, created_at, updated_at, deleted_at, is_workspace_room, team_id) FROM stdin;
cmsj031th0006ukjr9y8bczs7	\N	\N	Avengers	\N	cmrxp6xwg0000d8j5pnl9zop9	cmrxp6xwg0000d8j5pnl9zop9	\N	0		\N	team	2026-08-07 13:48:35.186	2026-08-07 14:10:12.089	\N	t	cmsj0p8dk00021xyk2udsbks8
cmsjzj6060001p0h7zwm76r0q	\N	\N	Pro team One	\N	cmrxp6xwg0000d8j5pnl9zop9	cmrxp6xwg0000d8j5pnl9zop9	\N	0		\N	pro	2026-08-08 06:20:53.67	2026-08-08 06:20:53.67	2026-08-08 06:21:01.523	t	cmsj8ynjt0007tzwg9avxytn1
cmsjzssx0000cp0h72vvxfbzj	\N	\N	Tesstt	\N	cmrxp6xwg0000d8j5pnl9zop9	cmrxp6xwg0000d8j5pnl9zop9	\N	0		\N	pro	2026-08-08 06:28:23.267	2026-08-08 06:28:23.267	2026-08-08 06:36:11.453	t	cmsjzsswt000ap0h7ng01ht82
cmsk0azyd0007mn9o1b5tp0at	\N	\N		\N	cmrxp6xwg0000d8j5pnl9zop9	cmrxp6xwg0000d8j5pnl9zop9	\N	0		\N	team	2026-08-08 06:42:32.197	2026-08-08 06:42:32.197	\N	\N	\N
\.


--
-- Data for Name: chat_message_users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_message_users (id, msg_id, sender_id, receiver_id, is_read, group_id, team_id, created_at, updated_at, deleted_at) FROM stdin;
cmsj0uuii000cr9lva00gkk8s	cmsj0uuie000br9lvne082thm	cmshogbjz0006unig73ya73rp	cmrxp6xwg0000d8j5pnl9zop9	t	cmsj031th0006ukjr9y8bczs7	\N	2026-08-07 14:10:12.091	\N	\N
cmsjzj60b0006p0h7zrz8ecb0	cmsjzj60a0005p0h7mey7l20y	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp	f	cmsjzj6060001p0h7zwm76r0q	\N	2026-08-08 06:20:53.675	\N	\N
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.chat_messages (id, legacy_id, legacy_source, message, group_id, type, user_id, team_id, attach_path, link_preview, app_type, created_at, updated_at, deleted_at) FROM stdin;
cmsj031tv0009ukjrg8njowh4	\N	\N	test123 created the group "Avengers"	cmsj031th0006ukjr9y8bczs7	text	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	\N	\N	2026-08-07 13:48:35.186	2026-08-07 13:48:35.186	\N
cmsj0uuie000br9lvne082thm	\N	\N	hai	cmsj031th0006ukjr9y8bczs7	text	cmshogbjz0006unig73ya73rp	\N	\N	\N	\N	2026-08-07 14:10:12.087	\N	\N
cmsjzj60a0005p0h7mey7l20y	\N	\N	test123 created the group "Pro team One"	cmsjzj6060001p0h7zwm76r0q	text	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	\N	\N	2026-08-08 06:20:53.674	2026-08-08 06:20:53.674	\N
cmsjzssx7000fp0h75kxrm44z	\N	\N	test123 created the group "Tesstt"	cmsjzssx0000cp0h72vvxfbzj	text	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	\N	\N	2026-08-08 06:28:23.267	2026-08-08 06:28:23.267	\N
\.


--
-- Data for Name: contact_submissions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.contact_submissions (id, name, email, phone, subject, message, source, ip_address, emailed, created_at) FROM stdin;
cmrbs2fvc00001bh8fyw98pag	DB Test User	dbtest@example.com	+46 70 111 2222	Testing DB persistence	Does this save to the database?	contact	144.202.100.225	t	2026-07-08 07:50:04.248
cmrbskz7000011bh86uq5yokv	Karthick Test	karthick@webronic.com	+91 98765 43210	Checking DB save	Please confirm this row lands in the database.	contact	144.202.100.225	t	2026-07-08 08:04:29.097
cmrj0yb06000012a26r77oyvq	Local Static Test	localtest@example.com	\N	\N	verifying local backend from static-site conversion	contact	172.66.156.100	t	2026-07-13 09:33:11.086
cmrj2pn0n0000tomeebbbnhp9	Static E2E	static-e2e@example.com	123456	\N	End-to-end test from the STATIC build hitting the local backend directly.	contact	172.66.156.100	t	2026-07-13 10:22:25.99
\.


--
-- Data for Name: conversation_users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.conversation_users (user_id, conversation_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.conversations (id, private, data, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: feedback_queries; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.feedback_queries (id, message, user_id, msg_type, app_type, app_device, created_at, updated_at, app_context) FROM stdin;
\.


--
-- Data for Name: firebase_users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.firebase_users (id, user_id, fcm_username, fcm_password, fcm_user_id, fcm_token, created_at, updated_at, deleted_at, app_context) FROM stdin;
cms93qhb4001g127tryssnjzi	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	\N	eN3sf4eHh0V2izDgo_l60U:APA91bFPnbb0kEWRHGNBkmN2NusPkPhLPkQMQx4SvgBsazNfy5-CfDhNPBIdw9R1mFRVJ1U8YPE7sbhbpPmqN79r4LnvZ_NX9Ue5giYC7xMycXXfVn5-kIo	2026-07-31 15:33:05.44	2026-07-31 16:09:10.452	\N	team
cms9arupv001q127tciqcekh5	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	\N	dGFBCdRUTLO574kN8_2ssT:APA91bFaJlH_hROpEAF1sNW3FbAntFRFYPR9tknQDVBZgbE9EN6i9Z3rSwdFSa-Ob_Yna3Wm4H0_9VOpOXWrAhaHTCs2GI7D2kI1BJ3GpxUGRqn-Dvscy9U	2026-07-31 18:50:06.787	2026-07-31 18:50:07.848	\N	team
\.


--
-- Data for Name: flow_group_users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flow_group_users (id, legacy_id, legacy_source, flow_id, user_id, group_id, type_flow_share, type_flow_chat, team_id, created_by_id, app_type, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: flow_limits; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flow_limits (id, legacy_id, legacy_source, user_id, tot_count, flow_used, flow_ids, app_type, created_at, updated_at, over_limit_locked, over_limit_modal_shown) FROM stdin;
\.


--
-- Data for Name: flow_publishes; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flow_publishes (id, legacy_id, legacy_source, flow_id, user_id, flow_data, app_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: flow_shares; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flow_shares (id, flow_id, shared_by, shared_with, permission, app_context, requires_pro, created_at, updated_at) FROM stdin;
cmsj0vjzh000er9lvi61jb86i	cmsizy4z70005qj5v5c4hov9e	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp	view	team	f	2026-08-07 14:10:45.101	2026-08-07 14:10:45.101
cmsjy4ye4000bynj3f17n7d42	cmsjy4avw0007ynj3rqrlb3hx	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp	edit	team	f	2026-08-08 05:41:51.004	2026-08-08 07:18:48.904
cmsk335so0001viyqcbnv4ds0	cmsizxcgx0001qj5v7fuxd3jb	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp	view	pro	f	2026-08-08 08:00:25.368	2026-08-08 08:00:25.368
\.


--
-- Data for Name: flow_versions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flow_versions (id, flow_id, xml, thumbnail, saved_by_id, created_at) FROM stdin;
cmsizxqq20003qj5vnmyswxtp	cmsizxcgx0001qj5v7fuxd3jb	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" version="29.3.6">\n  <diagram id="ByqskqYlwgqtICKhAMtS" name="Page-1">\n    <mxGraphModel dx="1234" dy="1131" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 13:44:27.53
cmsizyplg0007qj5vt2s1ifn4	cmsizy4z70005qj5v5c4hov9e	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" version="29.3.6">\n  <diagram id="52SByAR0Fq_Ls_VO6EAn" name="Page-1">\n    <mxGraphModel dx="1234" dy="1131" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 13:45:12.725
cmsj7t581000911rwptqmhsmw	cmsj7sn21000711rwntnpepuj	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="xr_ukPTucd2vB0oZU4N_" name="Page-1">\n    <mxGraphModel dx="1266" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NgYGBgAAAABQABOz4IWwAAABBkZUJHOUVGRjlFMTQwMUY0QjFCRh319JYAAAAASUVORK5CYII=	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 17:24:49.97
cmsjy2q9s0003ynj3lmiozzac	cmsjy2f1r0001ynj37yz2rwjs	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="IU1GDoConKKwoJuG3kVR" name="Page-1">\n    <mxGraphModel dx="1257" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="swimlane;fontStyle=2;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=1;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;swimlaneFillColor=none;fontFamily=Permanent Marker;fontSize=16;points=[];verticalAlign=top;stackBorder=0;resizable=1;strokeWidth=2;sketch=1;disableMultiStroke=1;" value="" vertex="1">\n          <mxGeometry height="440" width="540" x="20" y="20" as="geometry" />\n        </mxCell>\n        <object label="TO DO" status="New" id="3">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#A0522D;" vertex="1">\n            <mxGeometry height="412" width="180" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 1&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="4">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 2&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="5">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 3&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="6">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="221" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="DOING" status="In progress" id="7">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#006600;" vertex="1">\n            <mxGeometry height="412" width="180" x="180" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 4&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="8">\n          <mxCell parent="7" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 5&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="9">\n          <mxCell parent="7" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="DONE" status="Completed" id="10">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#1BA1E2;" vertex="1">\n            <mxGeometry height="412" width="180" x="360" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 6&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="11">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 7&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="12">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 8&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="13">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="221" as="geometry" />\n          </mxCell>\n        </object>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAh4AAAG6CAYAAABHpk8vAAAgAElEQVR4XuydCXwTZf7/P88kLYfghQc0bQqIJ01RQfFC8V5dD5qCN02KtvXe1V3vVdH1Wl1Xd3WVtkCTgseKTfFY11vX9b5pirdC06YorngAcrSZ5//6PMmENJ2ZFK0/cf/z5jXMzPNMpjmeeZ7v870eAeABANMA6ACkxfZT1BlbX64xto25tr83kl2WveW6xq7erC67LNe5WZnVubH/MWXGvq9lfdmT7DK7OmJWRuzO7erIjz3PJlc96cs1myrC4o1ll2efk+yy7HPSl7Lsc5JZZnZsVkZyHf9UZT90TzLLsuvN9mZl2XuzMmNvVmbszcqMfa4ys/ONPc4+zzz+Kc7/r8qs/o5duV2dVXnm1pdruPX1unVCCLFeSpmXepGDg4ODg4ODw08GpQ85aNAgrFq1ClJK003X9V5lueqsyu22H/Ka/tjM/u769ev/m0gk9Mwyknlt6lzour5+7dq13/CYZazjdfx+M46N8vQ1qU2sXbt2VVdX11qjjmRel33O15iVE77nVatWfWf8faMu8zU8ziw3jlPw86SP+V/2vVL7HvdIJBLdq1atWm3UZV+XOuYu8zx9XWY5yfwuMusy30sG6jzjfZPsawwyP18mva43Plu6oDeqLuMzWGF3jz6T9X0p8vPz8wcMGJCfLvg/RAih3kx+fv5At9vtNvvTmqaljzNINgRh/7UY9cbfycTstfwu3G73gKw607+V+b4y6kyvNc4HDx68eWadyXGP12fWW/y9zGu1gQMHDs1+bV/3mcfcZ9eb7c3KsvdmZT9FXfZx9vnGHmef29X1x/n/VZnV37Ert6uzKs/c+usabltuuWXiu+++c/EVcsyYMfj444/Vix0cHBwcHBwc+pv8/Hy9q6tLU4LHQQcdhOeffz5d6eDg4ODg4ODQXyQSCaQUo0qdLU899VTMnz/fqHdwcHBwcHBw6DdWrlyJzTffnIerlOBx4YUX4tZbbzXqHRwcHBwcHBz6jS+++ALDhw/n4XIlePzhD3/AH//4R6PewcHBwcHBwaHfWLp0KUaNGsXDNiV43HDDDbjsssuMegcHBwcHBweHfoMBLDvttJM6VILHbbfdht/+9rdGvYODg4ODg4NDv/Hee+9h7Nix6lAJHrW1taiurjbqHRwcHBwcHBz6jUWLFmH33XdXh0rwuPPOO3HOOecY9Q4/kO+//x6dnZ3wer2MV06X/xh+ins6OOSCico6OjowYMAAbLfdduny/oD3ZpvmffPy8pS3+9ChQ9P1Dg4/JT9l23aw5s0338Ree+2lDpXgwYgWRrY49KasrAxtbW04/vjjMXPmTGy11VY499xzcc8998Dv9+OWW25RkhzLJk+ejP322w/33nsvuru78Ze//AUjRoxI34vcd999CAaDzIyqzFts+C+88AIqKipw0kknqexuZGPu6eCQC7a3yy+/XEWvDR48WLXlr7/+Gq2trbjiiiswceJEdV1XV5dq008++STOOussJfj+7W9/w0UXXYRTTjlFtUHW817kyiuvVG2UdfRazzTbckJz3XXXobGxEUcccQS+++475Uv2+eefgyH83377LZ555hklhDz77LPqNQ4OG0t/tW1mND799NMRCoWwww474NVXX8U222yDDz74AGeeeSY8Ho/an3feeap/PvjggzFlyhQsW7ZMvebPf/6zatcO5rzyyitqLOOh41yaA5qgGPGz5ZZbYuDAgSgqKkIsFkNLSwsWLFiA6dOnY/z48UpAYQdLKFHTiYbJUl5//fVesznauWjvisfjKCgowMMPP6wEGyOs+aOPPtroezo45OLLL79Ugu6OO+6o2hhhm6Ow8NBDD+G4445DTU0N6urq8Mknn6jOl8ybN08JxiyvqqpSZezg16xZowQRl8ulOnuabJcvX45IJKLaM7n44otx8803q+uYqJB/l+3e0N7xev5ddvIODj+U/mzbnNhROOYgScGY/X5zc7Mq32effdR4cNVVV6lJ4AUXXIAlS5aoySkFkJNPPlndw6E3//73v9UkhYdK8OCs5dprrzXqHUxYt25dD8HDgNqLcDiMO+64Q2koDM4++2zcfffdvcpJtuDBe2+22WZK4v7vf/+rHpiNvaeDQy7MOuenn34ahx9+OEpLS1UHzXC3YcOGqXZoQOFg++2371HO9soZY6bgwfsceuih6pydzIQJE9RMlFFzTU1NmDp1qtoosGfCDtvR4jn8GPqzbVMrxwgMttkTTzxRaakfeeQRdf9swYOaE/bLc+fOTd3RwQpq9jn5cLvdLynBg+ojDmgO1lgJHtRMvP3220oiptrN4Oqrr1bCHDUmnAlmki14EGoz2Nhfeuklpcrb2Hs6OOTCrHOmmYMqZNq7H3jgAaWpGDduHN59993Uq5KL71HTZvhmUEgwEzwoZNAEOWPGDJUo6LXXXsOsWbOU4MH6a665RnXUd911V/reDg79QX+2bbZjbhQyFi9erI5prskWPHjMsYACNgUbB3tefPFFTJo0idrSpI+H2SzEoSdWggdVR5zdMeV8pn2PKrjbb78dl156KW688cZ0OTETPEaOHKnUdbQnUiW4sfd0cMiFWedsJPWhoMCZHe3W2YtG0heDpkausEpHUJpZrAQPmlDoqE7hoqSkRM1w6OvB2eHvfvc71fkvXLhQ2dsplLzzzjvqb9B5mokMLRa5dXCwpT/btqGl43V0huQ1nABecsklvTQeBx54YFqj52DPyy+/jP333x9Dhgx5VwkekyZN6n7hhRecJ94GK8GDarmbbrpJCQIUCAwozLExcqMTaibZggc7Yeaw54Pz2WefqQ54Y+/p4JALs875P//5j+o86VxHAYEzRM7+6L9hQCc9n8+nNvo2ETvBg+35kEMOUTOcI488Eo8//nj679C2Ths74aJRbP9Ud7e3t6OwsFCVOzhsLP3Ztg3Bg/zzn/9U/iHUjNA5Mlvw4GSQfnj0E6HTKp2oHcyhH9e+++5LQW+xEjx22GGH9Z988okTq2mDscANGze99w3oPb3zzjur2Z3hmb969Wr1AFC6pubCiFQx2G233fD++++rkC4+DPX19WqWSIHi2GOP/UH3dHDIhWHPNmZ97ITZYT7xxBN46623lFDNKBT6fLGNsdMmdNCj39FTTz2Fww47TJUNGjQIa9euVREFDInla+hIajg98xmhGZJtmIIHOeaYY/DYY48pxz0+R4TtnAMFBXsnXNzhh9JfbZvCMNtx5tplxusMwYMmQwrahuBBOGGkRsSxHFjDoAiarIYNG/aREjyGDBmSWLlypSt9hUMPvvnmG+VbwUZK/vSnP6mQQaOj5AwuEAjggAMOUDM8qpCpMmaoFsOxMmFYLCNhKEHT3k01HgUNStHsqA025p4ODrmggMCwQbYftlvO6tgRbLvttqo9s9Mm7LDZzqmaZijiihUrVCfM9kktGzUc119/vep4CTV+nOXRL2nvvfdWr02tQKl8PDhzNOzfFJ5pbvnwww9VJ71q1SrlD0IVOCNhqDlxcNhY+rNtU5PBPpqmwqOPPjr9OtazzfL+FGjo+8HZO51PmZ/iX//6lwo0YEitgzkUAOkPs+222y6h4EG900B2CrRvOfxw2JDpp0HNxJAhQ9LlP4af4p4ODrngzI+aCJoX6X/0QzVs1G6kVqRMw4GC92Z/w5koNSYODv9X/JC2zfGRAojTB/9w6M+15557UhBs5zf+GYBRmbHNDg4ODg4ODg79BbVENL1uv/32X1LweBnAvnQEo8epg4ODg4ODg0N/8umnnyofnK233noFBY8IM4M/+OCDKC8vT1/k4ODg4ODg4NAfMIqTkWtDhw79loLHfQBOosMN1wpxcHBwcHBwcOhPvvrqKxUYMXDgwNUUPLgYyHTGIjPawsHBwcHBwcGhP2H+FDqUu1yubgoe9wA4JTtLpsMPh97P3Bgya+wzj+32fT02O+9LXeb7M9uy643zzPK+lGXuM4+z99nHJPucZJdln/cFs9fYebRvbF12md15fxz3535jj83Kso9zndvVmZ2blWWfb0yZ2WZ3nYODw4+DKSEYVcSn6WkAhzLxCZ1LGcvMjZXGcfa51XHmOfeZm1lZ5parPnPjoGq2NyvLVdeXbWOu5WY2wDk4OPyyyRZCMs9/7GZ3P6bzzi7r783ub+iDNofMG5g+57E+cHOot50qSwzaAtKVlzznPy21F0D3gCHQ3Xy9+pSp+xjHG/brBm4JCI2n6rVqdEoepe6rTnvWpfbd7gHocg3kyYZrLY7z9fXI19clX6+Ks/9W6ijjb26oy94b1264ZnOsg0twDMi4NuN1A5DAZqILQvA7T71OXZN8L0NEAgM0PX1fTV2XPN7a1Q03v1t1v2SZWwgMy0uk7pHczH7P7LKNOberyz63q2P4MpNx8mP/T46Sg/NcassmzyWwxUDz7PBD890Y4NbS55lsMcCNPJd53dB8V8/X8UtWO9WqkvtUGa8bku9KN5rUFT/6OHWUu67Xruc1KxPJz2G8d0W6fkPZ99KVajhsUKlC446p87XShaRsu4H0dwKBddDQLZMNsgdCqPtnwmtWyw2/W6/X2NAturFeW69ekxAJdWyUrxPsgICEtqGcfO/6Pv1k6ELHWtfa5ImBBKSQWOPakH65FxJY614L+Qt5xDSpIa+rZ06NHu89q6dwd7uhpdqL2XXZZUIXcK1P/a5Z1/QQ1vndZrzWtcaVLMu4xjhOl3UD2jptQ3nyJuo8fa+Me6j9av64yWvVuXFZ6jVGWY97sBl0JQ9zsjHXbgTa4M0hBieTtGkDN4M2ZGt1LAYO3nCcNwCuLbdVx+DxFqnjVJ22RTJzLNEGDIY2NPk6wnvzbzj8cpFrV0Nf9XWPD6CvXAF93ffpc6J/uxyyK9kHGugrv4Zcx4djA4mVKyDXZrxW70ZixefpU6nOl6XPoSd6nmfB3lteeuBoaEJ0CT5mAlLt2a8K7kX6XEqpf7O2ex3PKQira9SxMI715Gt4LNRx+l6Z16WvSR67Nc21Wb5rM+NvCyhxke8udQ6Z7xJD3JoYkCxO1bPzc4mhLiFSoq7D/4cszf7MwW2iHQB2AeCkeHX45SCxHBI9RgHXwEL38D2eh3S5NxNCc6QBh18miW4kvlmuJ76Ka19eX64Ej9XbDM4fXDXeO3anYUN6ikMODr9AKrd5txtumKu1HBx+SeQVubYb3wxNDkv8kt62g4MZX/5uv08TK5ZpFDxWANgKwLDUsYODg4ODg4NDf9NNRR4FDxpiuJhCQerYwcHBwcHBwaG/odeTm4IHbeTFXK8ldezg4ODg4ODg0N/Qgz+PgseHAHYCsDOAj9LVDg4ODg4ODg79B52n8yl4tADwASgFEE1XOzg4ODg4ODj0H8w/MJCCxxsAJgDYC8Cb6WoHBwcHBwcHh/6DkbODKHi8CGB/AAcAeCld7eDg4ODg4ODQfzAz2WAKHs8AOIRp0wE8m652cHBwcHBwcOg/VgHYjILHYwCOAnA0gH+lqx0cHBwcHBwc+o+VAIZQ8GgGMAVAGYCF6WoHBwcHBwcHh/7jW66jR8HjfgAnAjgJwD/S1Q4ODg4ODg4O/cc3XHOVgkcYQAWAAIDGdLWDg4ODg4ODQ//BJXO3pOBRB6AKQDWA+nS1g4ODg4ODg0P/odaGo+BxB4BzAZwH4M50tYODg4ODg4ND//EVgK0pePwFwAUALgRwW7rawcHBwcHBwaH/+C+AYRQ8bgJwSWq7OV3t4ODg4ODg4NB/LAewLQWPPwL4A4ArAVyXrnZwcHBwcHBw6D++ALAdBY+rAFwD4FoAV6erfzrcXCSG+dpTe2PLPs9LXZtrrwFwpfaZGz9b9pYLabLP3nSbc+PYbJ+9bWy5VZ1ZmV25VV1fyjLPzY6z95nH/0tskVpigDHpsdSKi12pvfG5/5c///8C2X1DXzb2N/mcsQE4LbWi9zIAtwBY8r/wpfwMmPXb2WX9uRn335h95jExyjKPjXM72Bcae2PLPje2zL4z8zizLGGzzzzu7sOeKTUOS92fi8Uyo/ni1PvrTz4HsD2/rEsB3JjaLk9X9w8eAPNSC9Bt1scfx+F/Ew7MXwL4GMB7KX8iHv/SqE1FgP0Q+FAbZB8b52bHuc4zj7PLzPYkeazBDV39NgaZ15iR/QxnnxOjrC/7XGVWxz9kTzKP+xOmImBKgl8auwHYL5VA8sjUJC6T3m0muc88tsLse8/c/1S/hUP/wISi01KCSX9BQX04f/jfAfgzgFsB/D5d/eMYAqAJwBHpkl8GfIgoJRoPVq/jAW5NLXCztltn6lejjvR4iFyayE/oMrNDz6zvcW2eSxvcldA5W2a51UYodRPj/JcOhdKZAD77BXyQ7QA8DmAPk/fKNvC/8ps42GP81sxH8CmAHRgemKpjaoKa1PEvAZrWr/glvFGHnxyOVdTe0tpAhYHBfwAcmD778XQCGMEH6HwAfwXwNwC/SVf/OD4EsFPqmDYdCjWPAugAsCZlVlGmlYsPGHXFkHz3qV+uXvvEHa+1M5zXMLsYppf0fnzB5kduMzh//+gXKx/tXLmOTio0t1D1yX36WAADRm45aO91ut7V+d06dg69rjE2TXAvXLo05IdfDBSEMlVpbDhqP9jtGrzZANcW369PLF/dlaAXcboutTeOu3bbbsjEQXnakLfi3y1ImQrWZ22qbOuB+QOP2nmbK9Z06a2R9z6/nbJXamN9j+NrD9nxhi0GuI9ZtnLlETe92PFa6j0yVwzV0/ukvmGjA6eAOnWT/9aH4yt8jq1T7zOUMk2295oNVOE46HgIXbgTjcqMaZgFB6Q2tj9uA3AE7obAKDyBUzLapfl+PK7CWizDYpVdmPfM3jhTdWME9sEgjMFyvIhVyoOcwirrMs2RAgL52B77oRtr8F+8m/otMgVbQ5DilZtjC+yKtViOlViaIWyTnsdbYWfkYQt8hTeQUO2H9b0EePVuCnAIurACn+PljLacued3q6MQEzEUu2EZHsI36u+znNewDXNvPAPd2AuXQ2AdXldmY9XGMzZew/fUhX1xNLbFBViFWXhWCQzGNcn6zONK3As3DsE32BYLVP+VjbHsBKEG4f3U8abKFG3w5rP1778blvEG+X2zXXPyyc/OfndwRl+c2Sez3GjP2W3VaO+Z24b2mWxjRptlGzPaZWb7TLbR3nujTZIN7XMDZu0yc5/ZDjM3o5z77OPMc6NdGpvVeebe7jhzsyo3NqPN5yrLLM+sz1XGz2hA1wv2XWz//E0nAHgrXfvjoAzg4Y92JoC7U9vZ6eofDp1U2SmTB1K2I1NC/pJ6QBwAiXiwOUr7kiWhKSVHQBNcxO6GYCTKv2FJyO9bAsjuYKR1x3ShCXP9vhpNfW5xUzDSQjNT5gPQY/+Xo3Zd4BbYp/mjryc+98nnTPua+aAYyKN33bZocvHW/+rqlm9d8fRH2arXzB8X1x465pbBeVrZkq/XnPb319opWWY22szjRP2Use8JHevPeHjxrqmyHvcymFfmO1UXmKdD3FgZabGdzYT8pfdByCl5AzD21HujtlqHkN/3BSCWBiMtE9OFJoT8JTcIiEt1KU6pbG5hOv5s+D1fz4MBbk1f163z+zsOwCPGBZsg0zOy+s5OCVG9OQOToOE5tfBinfpM1lRhAQSOhQvjcLcS1K2pVjPrdahTg5o11Wnt5Xmos8nJMxP56FRapu9y3vN0jIELiwC8iDqliremWk1gzoULR+JuPJ0uN6MacQh8gVrsmS4zowoXQuBW6DgXs/H3dLkZ1WhhjgDUoTBdZkYNfgWpJkJ1qMvR51XjekhcBh1HY47SeFlBgag4JXTYf6c/LzSrPJ8SCAz4nFLgiKdLNgEKZ7dv3XFGERNOOfzfQ0HDeDb7U5PHyVohBY/TU53pHNV1/niU16rq1IAtrQbIcLlvjpTgILqTLrD3jCbrga+h3LeLkHgHEi8Em6O2nV9Dma9FCGy3dMWwwpnPP09JzpRQeWk5pFwAyDnBSKv5QJIiXOabIwXTyuuTg5HFL6Urspjn33VEAu5WSCwJNkcpJVoS8pf8GRAXujRMn/5g9J50hQkNft9bAigMRKK0jZl+n2Te1JL9ElI8D4l7gpFoZbrChFB5yXWQ4nLoYlpwYQu1DpY0+H3vC4EBwabo6HShCaEpvmpoqBWQVwQirTekK3rzq6yVkOnzMTZ9tumhkt6kBL6ilLqwJ9XwAXgVEp+gHuPS5WZU4XYInAeJMtTj4XS5GdVKGzAGdeqZsoaaFoFmSNyOeiWAWFOtfGsGok59FmvOwTB0KQezFTkFlGqcC4m/QeBC1IEaMWuqlfPaFqiDN11mRhWOgcBDSiNbp/IMWVOtBtPd8TW2wwI1UzNnBnaGW2l4KByWp8vNqEI5BB6EwJWozRHxdySW4gkleJBDACWAbor8M7USuYFlxmpPuO1tATGiI+AdkS40oWB+2/5C156PVxRlCjOmeEJt8yBwQjxQTG2JLZ5w7CtI+X48WExHbks84djl8YDXrr/ZaIrmdU5qn17AyWBOPKHYffGg9+R0QT9QEF56UWdgJJ2Wc1IQjrV2Brwl6QILChrbDuisKH4xXWDDlqff/No3cy7eO3XKCTA1VP0BzTlFFDy4TgvXa+kP5yjahqhKIVR1GpqPHoT8pbOFlAVSUKIS1cFIi2XnW3vs+MED87rek5CuYCRq21GGynwvQGAPN8Sup0VajPfRi8bycUfqUufspTkYifrTFSaEynzXCIErpRTBYHOL5Vo29/zat1XXQEQhsS4YidLua0m4zHeJFMyfIn8fjLTSDGVJg9/3Lw04yA33rqdG3mlLV2TRWFa6nS7kZxB4IdgUzexYehEq850KgfkSuKoyEmU4tSWhspLnIMTuS0ujw2bOVAOvKXPLxh6iCdeTSUEuaisdh/y+BU99+tXx9yzqNDqq71POx5si7PSMDsg88usMFEJTM4T1GAwfblcLIZmTnMFTK9GXAfo+pcLXsCtmqRm1OUmtBAfzR1CHE9LlZlSrQdcLDbtgloqpN2caXNhK3XN4zmvPwCHQlIZjVh80CLxuAgqwNWzaE87ESOhKe5BbQKjGgwCOgY49MNvGzDETbsTxJTREUZvDbp38TT+GwMOotdbaKmrwDCTGow6rUn0ghaCD0/WbDgVZWg2a+NjGeuEJtT0NISYOcm3m+eS0YZxEmkKthMyTbYD4TzxQZNvvFITbZgqhXSWlPLkz4LVdkNQTbl8Kqa+JB4s5ObXEM6/tBOjifgjcFK/w2gZHFIRjDwng0AGDhng+O2FrRqSZMrJhyZZdLjdn5v+OVxQdk64woTDcfouE/J2AKO8IFNHkZokn1PYpNK0rXlG0S7rQhIJw7HgBERHArR2BoovTFSYUNsZekEBJvMJrmIFN2b7x8+3ccv1nAnihI+C1/Z0Kw7E5Egh0njl2iVyzckyqmBp+6+e173AM81Lw4Kq0bHxUt/1YqY0zPXZspDQVltODUFnJdRBib0jkSeCJyuYoE5hZEvKXPgvIyRL6xMrI4jfSFVmEy30LIfFrqWOf4MKopT2qsaz0kISQTwngxWAkelC6woR5Zb7KhMBcCO3qYNMiUyGK/GXavoO2Tqzi5x7W1S3HVj3cSq2PKQ1+X1AD5uoCN1c2RRlRZEnIXzIbEKdDF4cFF7YwvMmSsN/3hQTagpGoIaWaMrustMQt5FuAvD8YabUVNEP+kjAgTnK7MOG0BdFev6XB3ONLijSX+ABCPBtsajk2XWFCyO9jNMv5MqFPqXxo8W9Ts0NC2zF9RDY12EFyMKcPC23iFJI2cDaGoBvvqAFax962A18NjodUWom/oR787NZUKyHnDxCYilpE0uVmVCuNzHuow6R0mRlVeBECE6BhAmahNV1uRhWeg8AkCByCWryQLs/mDOwKDW+rwbYOR6XLzahWPgSnQMNEzFLfmTnTsRkGqZnRh6hTpgFrqpVJ6SxIHI96ZT6xplqpeb9BndJO2VONTgh0olbZt60xPpPE3qhX2oOzACWADE1fs+lA/6pXUm+Hfc+fzN6aJxxjmy8XEPt1BIpeT1eY4GmMdUKKz+OBIluTWcH8+IkikbhfQFzTESiiQ7klnnD7O4DcPh7wUlCyxDPns3Fwu1+XQi7orCim/5glnsbYXyDxGwl5ZGeg2NYMqD4TsCxe4R2fLjShINx+roC8Q0r9os7gSE4mLPGEYq9AiB3igSJbzWXhvPYxUpfsax+OB7y2Aq+nsf1BSPlroGtcPLDDR+kKEzzh9i+EQFtHRZHt+OBpjN2QNC0mKuOVo6jhNtwaqKGy1iT2HYadj6TgwdkEZwz94eRHSc7oeKmaoYomTai89CxAniWBDzQd3wSao7ZhiQ3+kr8LCM7OLw42RWlnMiU5QGtBXcryGc1RqmZNaZhaOkno8hkIfBBsilIwsiTk9x0oGMssREOgqcXufYpwue8NKVGqQ+wzI9LCTtiUhrLSXwkhHwVkKBhptTVrhcp8V0GogeeCYFPU1rYd8vs+oUkrGIna+rSQULlvhZRoqYxEJ6cLTQj7S66WEDM14NSKSPTedEUWD0zbd9CaxMqYBJYEI622jbrBP/a3AtptusSFM5qjFECoPqfGh5I0JepNEUYvMUrL3BRZrQZdqjkPQR2s1ZjJAfpdSDyC+hzPWQ1OhMR90HA1ZqkEf9ZUK1+N9ahTz5411WpQPhoCh6NWxehbU620n8dCw8WYZa6GV1RiW+QpU8xy1KnvwJpqFb10FTRMxyzYmhZTPi0SdTBmW+ZUp/yFBM5BLe5Kl5tRrd7n0JzmHVKttFcFqIOtiQHVSvt1NTQEMEtFaFGL8u9UbabT46YCP7uhNR2ZcZzG09hxN6ReAyFPjFcU0+HcEk+47T1ADIkHvLbfqXdu224Jl3inTwJCOPYUICcOcg0ptNO0jK79dIt1g/LaIOXb8UCxMXkxpXBe+xlSl2zHv4sHvFwixJLCcFM5fYcAACAASURBVKxVAkPjAa9hNjOlMNx+lIR8VED8vSNQxAANSzyhtgehiaNl9/qdO2eMofBriTIvAe/FA17bSURhaOmdUmhnCaEf21Ex8rF0hQmecOwTCMh4hdd2fChsbD9fSvlXCO3yeEUh02uwP2dwAKFGuuek64fB/moUHw46wXGwprnj+HT1D4OqO6NT6fHghfxj9we0Z4VUKv4Rweac5oAL1MAL0RiMtHAtGVNC/tIbAHmhgLwoEGnlgnemNPhL9xGQ7HC/Wte1bs+aRz6ix78pymyhyc8g8XwwErVVtYX9pc9IyP01IaZVNLVYOkiGy0tKdSleF5CPBSOttuadRn/JdB1itgTuqoxELT87CZX73oREUTAS3T5daEHI7/tUCHQFmqK2g1SofNwJkPo/BPDHQCRK72ZLeE86nVTmMC81Hl96rO6SDwkh/xZoajVm+9Q4US1NX5yc9uGfAbZhQ71If6We6tlqPAHgcEgcgXobZ8ozsR10fASBVtQq0401Z2MMupU2YgHqlFOrNdWgBrAIdRieLjMjKUhMg8AM1Jqr1tPU4FZInKwEH3tfEYFqNcnYGoOxk615qVr1C/Oh4VrMUgKINVV4DQJj4EYx7lKaA3OqMB1Cfa6bUIfL0uVmJDU9u+FrFZXSYzLUi2o8oLQnvL5OCUDmVOEkCFAgvxF1PUJSDR8stmdLH7OfEeP9Uajr8fnoK0FzooS4oDNQZNmXkqQpBnvLtWtHd9bsbNmXbjPny6ED8ta0SR2tnUGvrXmrINQ2XxPiBE26940FCyy11sQTjrVL4Ntcvg3D58f2cuniZSn1hs5Asd0EklqBZyH1PbccvGq7xSeMtZzde+d+MTrhWkdB9rF4wGtrBiwIx24REBcC4vh4oNBWI1cYbvtMCm19blNM2yUC4iYpcG5nhdd2UloQjr0hILzxQJHt+FA4r71c6nKBFOKOzoqizOhW9n/sB+mw3R/Ox2xzo3lDw9GPPg/2qtLcGPbwHgNJQ3DkQPHd0LchEYXAaKm7Dq9c+K5lR6UcPyGp5n892NRiKc3OLfedq0ncIqW8o7K51dIWFpriGw9NzfI0CG3fYNMi24xsyQgO2ZZrBh8q8/0DAkdAyMuDTa2MCjJl9rR9t3YnVi0F5JvBSKvl5yEN5aXHalJGdODRykiUSX0sCZX7nhAS+3Wt1ovPeGKxrfd3yO97GVLuGGxuZdZFSxrL9txVF100Gy0IRqK2s5OQ38eBb9Rqlz7ynAWLLQeJhvLddxQyEQXko8FIa+Zsn47CbHd8yHM6m/0MUGvH0ELSs6NO+l9QM/Fr1PdwlO3JZLixE5ZAYDVqc2glSDX+C4H3cvogJDUYk9GFUWhQidnMqVaLQFZB4mrUq2NrqpValZ1zFHU9HBB7U61m9vurWVGd0vqYU4XdIZQwcT9qc/iQ1YDmUvZB41CHD9Ll2WyIHpqPOgTT5WbwnswnpKEEd+fIF5PUYFDQPgl1sJ7tVytvf84EH0RdL/O0MbDT5s5cH5saFLwYScZ8NIZZPOVXoMKCb4sHvHYCJzUdswBRI/Nd+3ee7KHzsyWF4dhnUqI7HvQa6RVMKZjXfpPQ5SVS4pTOoNdWOPY0xlogxbB4oCgz30QvRj+wYou1a1bGBMTr8YD38HSFCZ5w+zxAP1FAm9ARKGJ0lCnja2Xe5wPbmX3z/XjAazuJGNHQVqVpok5AXNwRKLJ1FPWE218D9JHxQLGtgFDQGDtJSNwrIW7uDBTZmuo94fbHAHlgt1g/+ouKMZY+WoWN7ROllBTOH4xX9HCSpRbaEJ77qz1TO78DBY9DATVb48BsG9LaB0wFj3CZr04X2ElAFmgueVjFgsW035rS4B+7lxDaS5BYLmTXuEDzB1Q99aLB7ztFgP4XWBBsilrODBum+XwioT7bNroUh81obnk2XWlCuNynsmkGmuzNFiF/yV2AoLRb14fw3uUQiAWb7CNdGsvGHaALnRqAt3P5aoT9pY0S8iQ9ISbNeKjFUIeZEvaX3i+FPL5LE7tVLWixTO2sBMRvh3YKgWggh/9LqMz3GAQOlsJVWtn0rmUG0tnTxm7tTmjUirxXGYlyoMqEuQ/Y2dG3gz4emxoUhujbQSgIJJ1Mq8HZ4DkQOBm1ygfEGoZ4CmyP7zEa87A6XW5GtQqr1VAH27aHasxSw6+GwzBLaYzMqcEfIPF7CMxBra32gvc8N5VM6msMxn45NBjUavohcRrqlYnWnJnQ0IkVEHgLtaqfsaYGf1Mhs9TA2vlqnI5iuJSmhT4luYQjZpk9HTqOwmw8lS43owZHKzMYTX91sJzEoBJFyFcaKTqomg08xgyRqnrLfu5nhII0Bep0e1ZaCfeaz+lz1xnw2mpjC8JLzxXQaB69LJfZwhNufxVS37Fb+8b7RcU4y7ZfFI6drUPcAcgrc0WneMJtzwBi7zw9sePSylEUACxRDqqQ38cDXtuILE9j7I+Q+EOfhJ5w21JAWxMPFNk6vRbMXbqfcLv+zTGqo6LI1tneE47R4nBY/voBo5dUbW/pHzh8/rK9XIn1jKr8RzxQbDnmEU8o1gCB02S3PLjzdOtIFu/cttEJTUSh4aV4hTc74ScT4xkT2v4SPDhWjOEDYqi7OYOxtfv3gV6CR6Pfd0oCuEWwTGhH22kb7j2uZPv1bvEGJAp1lzxgxoOtptJ0uKzkGCm0hYB8LhiJWkqyqTBcClVDIMRZwaYW20YV8vtel8DIykjU1gEo5PfRKYs//OPBSHRGusKEkN/3WSqniK3Er5w+NfmS1PEtpKvUTiPUUOa7SQhcksv/gjT4S64XEJdJqU2tbF5k66RIswl/u2AkyjUoLGko880RVNv3wem1we+LCWCNxT0pXfP9c3BncqJNDSZKMjpMOmH/IzWY0+/CPlcGqVICL50jx6Eets5fKRPDaNSpdUCsqVbCwXXQUYPZKr7enGrQRMfZ++Mms/KeVIF+VBSmOMM5AHW9ncLTVKuwUobOXod6FZ1jTbXyIViZ0/+jBr+BVPe6HHVq3RNzZmAo3FgKgU9QC9t8MintzbWQqEa9jZ8KqcFukKBG9hnU49fp8myCGIh89Tt2oU5lLDXDEDw21URi1C6yb6bQpjR1qcH023igyDYM3DOv49eQkv3uvfEKr632ytPY9iAkjksksPvnM4oZLm9K4bz2X0mJxyBlXTzgZU4pSwrD7fMk5CkJV94+n582wjLQgHjCMU7GRsfXLi9AzQRDa9kLT7gtAIiQhJzZGShm4ixLPOG2dwTE8Fzhxds+sHxI/pp1nVLgpc6KIlsrQmEodqcU4kwJ/Vd2Tq+ja1dssW7g6nZI/dV4sDhbQOiBEqQgroCuB+PBYstIzIJ7O7cRXd0fSoklnUGv2aSYwrOKpttiykVjhpSdtyge8NLf7cegkovyAeEslBIRJSkzCX5joEMMPeBV3G942jgPEvoHUsq1QsOhgaZWSxUWCft9L+nAWE2X5wYWts5PV2Qwb2rppISO5yRka2Ukunu6IovQlJId4MLjQoqBAuLWikiLbehi2O/7pwQOWiPF6LOaWyzVUiG/j5LxWQJ4P2fSM7/vbQiMCDZFbRtqw7Sxw0VCo/f4MJnAPpUPWUeQKAddKe+SkFdU2ufKoF/JaVIKOr1dGYxEbfMQhPy+V4QUYwa5dx5+woIFlnbwsL90JiA5+J0biEQ5o7Qk7Pe9S3+eFa4hIy9c8IpZxkcKbXTa3FTDafmQ0bmUXIAarIBUoefXo06t6GxNFeZDKN+GQ1GXI6dDNegcdhC6sSPmmuQIMTD8ChiKXWuzrlIVqiDUAP426tJRQ+YkZ/oUSHVIlNuajarwGwjloxFBncr/Y03S6XY46lQIpzVVOApCaTgoRtnODFOCzFrUqcXZrKlBRZ9/p2RUEmdhjHaxncWmPhM9/XdFnVpzwgzDlEHByDYi5GeCQj41eVyDg0EFQO2beXaDMxkRahuvCfGyhGzpDBRz7S1LCsNtN0vl16CdFA8UJv+GCYUN7T6pyTch8ES8wmubcC8VbXExNDkjPt16MCWecDvzMx0n9K6SjsodLLWxRfNje+k6Xmbeo3jAa2uyKwjFnhQC+wLayHig0FQLb+BpjLVDYkU84LUX5MIx5VzfR1+NZUKiMx60j7QZ0dhWpUnBCclV8YDX0jF97AMy/5s17XQ6XWfjdMoJgxqLhv990XL3Zlu1d5gLKBsDTag7U/DgA/JqymZppLP+oRhe3UrwUAMvsKMQ2oGBpkXW4XMc+Mp8TCxzpBDilkBTi+msZ17Z2HEJoVFI+ia/K3+PUx55y9SpqXHaWK+e0NiZu6TAQ7nDVktnAzKgSf3giubFlmqpcHnpb3QpLxXAN3kDsd+p90YtVU9hv+8pCUxc58ovqlnwlmXM+MzJk90jt/6K332J0DElsDBq2fHPmbLbUS7N9SggaoORFtt8CQ3H+3zCRe98eV+usNlwue8BKXGc1F27VC581zJfxNwyX6UmUCcFbs39nfqo2t5fFyixSQ53DqC0Bptq+CFXoU1qngaiFhVqsL0PdSr3jTXVasHFCyFxbs7ZNh0/abJg3of6dEREb87EHtDxGiQeQL263pwzcQJ0NKiwtTWYaGveqcG+kKDp8b+QuNb2vSa1IjTxUJixNcOlBKlJGAAP7lCJBM05A/S9YnjnM30IxWUHOAxfo8jWQbQK+0Go73Ee6pRga08N6Jy9I7qxaw6hj4m3joLEfpit+ksrDFPGpppEjBMAmjWZYJChwDkZ2bBkeJfmYl8yWMsXY9tP9lp+TwXhpTMEtFkS8obOQLGlI3FhuN0jhVwMiQ/jAa+t9qow3H6GhKQP3Y3xgNfW2b0g3H6jAC4WAtM6KoosNbzb1X+2fV5+HoWS1+OBItsJpKcxFobEKQmI/T/PFV4cbnsbEAwFtvU/KWxsP1rStCfkX+MVXtvkeJ5Q7CMh4O4IeG0TOHpCbYdCiCcg5Zx4sNhWiC8MxRZLIbdZ41q/44rTdrR6RqmtVQkzR9z5bvuyc3e3jV7qIzST7kLBgxLUm6lc7D9WmkkLHiF/ycOAOEZC398u/wYJ+0uvl5CqUw9aRHE0TisdlUjIVwTDeoS2j5XJJuVTQI9rzuCiuTJ4cgYvIa8WQgQDTS2cJZnSUFYyQwjtJgmZn5DigDOaWyzzIITKfJyVTnVB7DPdJryWhPy+R9mZaRouqWiKWnb8959YssPabsGsqDTv2Dqd1laPzxvw1fovpI6WyuYcYbNlvhulwKVSyvLK5lbLBzWVsv5xSNwfbI5yJm8J/U8AeZqQ2oEVzYssBTkjnDaVOn1TDKelXTM5uxmF1Thc5ZWwnXHgTJqgcBcEbketypVgTbUyL5wPgRrUKmHBnAoMw0AsgcQbqLfxlTgTR0JXA+R/oWNfzLZZqr1aObrSFPQ1BJpQa5IYzaAKR0Ko+3ZgLcajMfWdmEG/CprhBCZjVrLTMuVsFKFbpTiPoS5nptcXoGEcEtgJs1VmZHOqsU0qT8B/cvp/kBr8AxJTIXGIrdBXrUJ1+ZkCOX16NOjQlallU10GgIIoTYj0p7GdZRt4wu00eZcKgRM6KoosQzc9c5ceArf2tJC4vyPgtewjCh9oHyTXyI8gsT4e9FqZrBRFjbEjdSnoT3ZPvKLIVuD3NHZMh9QbhCb+2DG9KIfZpL1DQn6TKyrGE45xeYfLhSZO65heZBsG7gnFHmbemwFruzyf1exgOdksmBsvEq7ER4B4LB4oso2KSZuMAl5bE2xBY6dXyG5qE56KB7y20amecNvLgFYqNOzeMb2Izp5WbMgwvd2o4Vi+xPrZ6zs0u+3KB8RI+sX1GCxNF31E+YswrXeD34cE9CmnRxZbZiUloXLfOZC4hhnVAhZZRB+YNnbr1QnxqoAYk8tBNFTuexpSPVjfBiNR21kUk3kJoEFCXlMZabWUzhvKfVMEPegl3NDkccEHW59MV2bRUO67VUhcICBOCERaLNWMJOT30VRxnADq7cJW5x81ZvPEwEFLpRDvBSMtOc1hfQ6bnVpaAV02aMDVFTammDnlJRM0KV4WAi8Fm6K2GRkb/KXXC8iLocszgwtbaUax5NDRWy965rMVzKdCiZvahU0NPuxJs1sBuhFHPuPhLd9k0mxAB0WaInJlEKWz53UQuNl20Cdc14QCUJ1KymfOBu2FCzoOtJ2Vn4HtU1Fe1DQttjWbJLUSHJT52fdDrZqkmFOFS5QZiEd1ahkGc87DAKzDB5DIRwK7YG7anNWbGkRU5JDEnqhXuTisqVZCCQUZW1OAIukDcik0XIhZygnVnCrlnDsTEjej3jwTcxqmt5+DfZBQggf9aszWKvq54bPG5GaWCcQy8YSZ4lxMhsTddo6fw+e37eZKiDcB8W48UGSb9M0TjkUBMSKRcO/6+YwRlhFZRQ2xvXRNvgRoL8YDRbYmw1RkxssS+EenjdBDGBUjpdy2c9BrhTjhBEvtWWFje5WUspb9Y7uN2YIUhtr+KiHOha4fHp8x0nJ8Spk4+Dx/Gg94bS0MnnCMQt6B7rX6jm01I61Me4CUwtPY/iUgPsr53Te2PQopjpKaa1LndPuIpM1PvvKF7+77o5FPhEK99YSj7/AZ3o0PCNfI4OydBbbSXx/g7Po53rTB77skGInenK4xIewvKZMQ9wiBloqm6L5m65DMnAlt5KLSVyDkbhCi2s5BlKm42aCpElznyj/YzsQxp2zcAS6hPyclGiubo5Yd79wy30GawDMCWK4Dl1dGopbqyXCZ70KaIaDL3wcX2qdCT2l5aFd8MpdWJuT30Tt+dTAStbdBJ699BVKOyRU2mwoxfk1A3BuItFjOJKhp0hOSviqdwaao7XoqYX8pVaJ3CYhbAjkWqGvwl/524fuf3/bQ+2pcpznDWFp8U4KhbUnPeToVrrfxLaApJIFXVRbPWtqCbahWicj+mjKb2P72qcRXm9uuq5J0jqSD+BBInGS7/ktygTgKHQnOOFEPa0e1apVwis7im0OgCrUpnwAzqkAtXBM0JUjl0vRQA7prSpiwdrpNRu/UwIVjcLfSuFhTpdKbi5xJx0gyr8hsCMxDrY1fSTJXCDU4C3KGAlcrIaMMdcq5lKYM/sa2gvfPBJ81Cvnm6f8zKAi33SQgpgLynXigmD4hpnjCHcMAPQoh1g/6Zu3On5y/o2UGYpX/QxOThBR72YWteu9pG53oFjTvLIsHim2jUpKz/a5WSLE4HvTaPnueUIyTxv2l1rVrZ8UOllFHhfPaJ0tdMkfT3M5Ase1aXp5Q7CwI3CWF+E1nRRFXebfEE1ZmE1dHhb2mxxOOcZw51SXkwbEc66t4wrElgFgXD9jn/2CkixA4lWHDHYGR9undw7FrV//7/iu/mZsO8OJ4YurasJHQZFpCGYFvlnYXqmlyDmw54GyY0h4FiMxVW3sxt7x0okvKFyXw2WBX/t4nWAgJofLShyH1fSW06yttHEQbynx1QijBaaSQ2uRA8yLLDq322J22GZA3YGlq0TlLlez8aT5fdwLPCIkVupCNds6c6UXnBG4PNkVtbXap5GgXaxIfVDTbaxBC5b4WSGwTjETtnfQ48NNXAzg2T7p3sVvXZc5xexS48rrfh45FweaoZb6I2mnjtxigr2+ROgas784vqbHwqSGp9W8oodNcZu2DoMKGS0t0Id+56/XYu693fEvzHn1lbNca+JnIXNuCET/mg9oMFMCtNIYrsR67IZQOwe0NfSU01EPiJdTBMiJLkcyVQRPDaMxJh7X1JPm3/w2pBpMrbP00SLUSSgZDogACB6LOojOpVtcwbTqFr7/bRptUYScIZTZZiDoV/WNN8u8fC4nJtuaNKjBz79WQOA/1ObKSJiOCRuVcSI8kc4C8oL7/ehtn+g0r2HJVXltzJarwR2hK2KpArfr+meWRSZhsB6GfCc5a+azRzHeR1XsoDLedJ4X2Oyml7nbL8bFTiy392TzhGDXmO0rNtWfndI/lSsuecMdcQJ8OTZsSn15oKUiqtVI0F5+nQV3ru33Lq0Zbq/hr38zzDNr2Yw438emFoyBEr8mrgSccm8vYJNktD7QLMS1u/HxUt1y/GEI8F68oso5yotATattfCMHnry4e9Nr63XnCbS8BYtdukV/0RcVwS9+rwnD7jRLyUl2XFcsqixkcYIkn1PaOFGJ4Z45Im4Jw+01CyPO5cnhHLuGooW06NNH4zeyLnlj9n38Yi7L2l+DBfsJHwYOdKZ1saOux8m7tK1SHcTZlK3ik1vags2mXnpB7z3io1TSNbMrp82ghEQ40Ry2zE4bLfTdJRg9wBgUcHIxErdeWUPf1fSGAWCAStVTJzveXFnYnM51SHf1yMBI9L12ZxVx/6Z4a5KuQ4sFgc4utmq/BXzJdCMHZ7te6y73PjAXvWKoaw/6SZyUEzRxjKmwibUhDue8mTeJiXcBf2RRl0iRTJFO8+30MSVwfzJWrpLz0HUi5i0xgb7tIm8bykgm6FPQOfymYQ5AiKq8Jo4Iiak0d+vSwM6Qqb1OD2fqMtmn+HpO5Kmi3HAEX9rBNUkWtgFCJxz7B19jTdhXVpP9BGTTsCat1VZImC0bMUECqRx1oj7amRkV68DNNgI6DUL8hgVQvkgnKRkPgOdQqJ2BruFaMxGLU50x6RkfiMyARRL2NGeIMnK6ymUj8CfU20TvESKTGvss60iRJcuE5trm1cKmEYuaDadK8xIGpHetRmkOQZFg9tSe3ow6XpLLbbs48Fyqr6qYH+xu2Ywpzpr9rYbi9jDN9DvxCiCM7KoosBURPY/ujQsojhMCx7RVeZvI1xRNeeiWgXQaJK+JBL5dLsMQTbn9bQC/RNblP5/SRtj5ynnCMJsUSt8j3tVUMt/Rp8oRjNK3Rl++sjooiS+E8GQq7dokA2joC9hEcIxvkwC4ttjxlCrKcwBJPuP0BQB4vNVepnXBWEFp6jhDanYB2RTxQaDnRJUZ6+TWu9YU2DqLJVOi6pNPtXR1Br6WwSbyhtvEJIV6FlPfGg8XsywwXBAr1lmPVRkCBspSCB3P28wdjNMOodPUPw0hGRnjvXjwwDa7vEyXvA2K4XRbRUHnJLZDiZAk8VWljikit9MoZ9vZS4pzK5qh1xsHkwP+RgOBKt5aqrsYjSjdLDJHUdOgQsjMr22YP7j15/Dbr163nqrCvB5vsw2vDU3xHSU1lUuyWur5/5cLFlh1/yF96HyDLpcu1d+WCdy2vIw1TfEFNw1xA/CEQabFtrMxVwk5ad7l3shN6Qv6SJwFxCDR5tK1Py5TdRwotQSFyWTAStVWJkga/7y0BbBuMRKnGp3MbZwmUpG1NQz8T6Th2I1Kr1/uowXNq9s4oDru1Wuj4mcC/IJTmYqJtOu5kttELlOOjXYKupPaAGssnUAdLwVhRo1bC3RMSe0GgDLUqY6w5yYXPeG27bV4L0te1Ys5Un4eC0Q22S8yfhcOQwFOQCPXBDFUPgSB0HGarPSHJ1XbfgUQJGBZZl16DoidJ8xKfkYFIYALmqAmZOWfgaGjqN2CuFGNpBf6+NBvSJ8DSb+tnhKZDarH4G/f6fkfc0zleS3T/BxJxCO3WeEUhzV2mFIbb/qYLERAJXBKv9Fpe5wm1VUCIWQxxjge9XETPEk9j+z8h5SFS4sTOoNfaZKjuG2Pm6KlI2PtVFIRjJwrgHgHc1hGwH3jVuiaAKx7w5hwLPeH2GCC/zhU2q8KLhfi90MW0jmCR5fPsCXX8GkI+DMhZ8YDXVCg0KGxsmy8lTtC7u/dbdvoOln5XnsaOIKR+l5RY2Bm0930ZPvfjbTVX/qcCeCMeKOZYTncBQ3vfX4IHx7JxFA6MWR2Xkbe2I/cN2osNqZcaj15qrwa/71UBjJPQD7SKdgn5Sy4DHXUEWoNNUUPV04tQua9agBEZWEffgkqbtVqIylUBOSYQyeH/UO57TOoYwhCmddvkH1RT95ZljHvI71sGIT4PNrUwBbElKiMrtOeT8ph+QjDSaqlqDE0t/TN0+Ts2rFyC1Dx/6Z465GsSmN8HXxFGrRwHFyYGF1iv4Bsu94WkxFQJnGvn0zLnuJ2Hau4BUQE5SHe5S+wEGRL2lzRKiGn5A9YVnXKfWiuHMw/awqkBsU0V/DPBzocDK+32bM80Z2yYWVSrhcGmqsHPLtrhDOyTSvGd34cICq5jwwf+UlvzRlI4YBgi05vncmSlLf8YSLWmy+WoV+/bnGSkDZ9jF1w4wFIrQPq6VkwVylP5R+5Fbe/BLk21WjWW4a1M5GU7g8xIEHY66il056BaZcg9GALnohamOYJwAQZhdcr/RMOhtllhqzGRplpoWJKVCt/QKPA3/H26dNOB/TxDPR9QKf8zUEuno+sFSNklpXysM1hMDY4pqRwU/A3m2qVYVwnCdPmoEOLpjooiRklY4gnFGDLLtnxdTq1IKEbH7Asl9PM7AyMtHZk9DR37QOgvQciInZ8K8TQy06rcKU9PjF5aOcoygSPxhNreghDDc4fNtlVJqYSuq+JBr6VGcvjcj3dzufLfAbRHc0W6FDa2/0lKeZEETu4MeC37ncLQ0nIptHsg8Uo86M2pifaE29sF5LcdGyJ9jP6ZsH+21br3EU5Sd+coyE6DKkpKwrZ2oj7AKBIj3KrXIkkN/pLHBcShgD45GFlsGmrXUFZyphCCjk/L3YPW7HfaPZ+YqpDC/tKpEpLe6B9KyOcqI622zozhMt9CKXDEui59l5pHrFO2q6XgpRgFgaJudE8+I/K+pa9EQ5lvsRAYmpq9W5LSCrwgALcUmGm30m5jeen5upR86C7L6ZxbtsswCfdnENpbwYj1mjYkVF56C6T8jZ6Q02c81GrZWENTfX+EjvMk5M12Pi0k5PdReBmbkPrE05sXU4VmSajMxxTjd+q6Nn3GwkVGx8/Bk057tOHaD14/D9SKcQbEdkxtx4YVPatxkVr/hH4IdWqQMYdhq3T8FMiDhvNteXwoTQAAIABJREFUV2atUb4PTJ98F+pUuKM5VbgVmtJELMcITMbM9EJ2vakGV86kAyU/Q2OO98oBhGu1FELDAbZL128wcYy09BMhZ2J/6Cqp4LO2Pi3JhfQ+hMBHObOSnoVTkFAJ2q5HbXrZbmuqcAuEyr1SizobLUS1Squ+d2q1W3PhhJyOMXCpUOGh0DEes9MrchNDo8BB1Nbm/zNBDR41efz9js18D55w+zNCyOFS4rV4wGuZAyW1XshsCPF8vKLIchHNVNKxl6TEp51Br61jusq2qaNKAA92BL3WbV8JE7EgNJqKRF08UGQsONmL4salo7ql1gKIaM5oj2Ta8iOlnti9s3KU9TpB6tq2hwBx6Go9UfiNjYBSMC++n9AT1IKG7L7P4XOXbetyd30sdLR05FpIrzF2jpC4kz4gnYFiy6ikgoa2w4VLPMFEl9uvKdr9rRphOXkmnnBskQS261xS5MFMYfQn7KsMLUl/CR40ne1BwYPSOaX0/lB3sxEaK7QyO17ahp2MOIFfQD8sEFlsmskx5aDJwWiNkNoBVg6ioSmlh0KTT9MMo0m0B2yiUkhqXZUal0v+avqCVss1G5LmHe1AQI6TEJMrIy2WIYmhspLnALHnYHe+18oxlnDZ+O8TqzjD3QoS9wabo5ae5A3lY48VUntYSvy9sjlq+/CRkN/HQfD7XNEuIX/J6YC4SwB/sgvbbSgv/Y2Q8hpALghGWm09uUN+378E1/bRcZxd0jMy57idd3bl5TOEbk6wqSVT1Wo07P4Qen8K6APDNkgvfbZnhpsvSuXLYDvnImWWHYoKW3XhWUjlbJjLQZOLqVHF/0/UqQgRc5JLwfNvSnTjoBxJrxiVcSOk0tq8jHqbaJNkVtS/Kk2HRBXqlYbAHGOtGIlDbbU3yQGaHQ1DXO0j5pJZSZmK3NyB12AGJsCNl5WvTK5IE5IUvCicPG2bOr5aaU0ozN2GOhvfjLOwFRJKkCpKrfabnfvG0CiYmjI2AdRaGdlrcxU2xpqlxIGQaIgHvZaamsLG9oOklM9Lifc6l346DjMP7jG5NCi4L16E9d1v0qwt8117dJ7sMfXjI55QjH5elwCiNR60T+ZVEIrRn4ST2yfjAa+lVmz7xkWbueVWFGSZmdPSrE48jbG7oLJRi6M7AkW2fZmnMfYXSPxGQh5pl+K8KBTbQafDtZCvxiuU2cKcB6TLs6ady0p8naFpMKWwcenRUmqPSIm7O22Es1Ro8fOA/E6KvL06KwosJ9qkIByjgHKATLh26ZzR43fiBNXQpnJiaO3k23c4Wd2TgoexEEx/RBYwcYnh2Mi1N5RTVtjvmyuBoIAsD0RaTTu0hqmlk4TOBdIE39NkKwfRcPm4PST0ZyTwgiaRF4hEbW3Q9AFh56sJec50mxVkG8pLL9IkKqSQHiHl6Vbvk4TLfPOkwIkJqe+Vc6bv9z0EIcdAaq8EIy2G2qoXaq0WIfmj/DNokc8kk6Svhhz13Zq1hef/6xPL8LWGspLDhRCPC8gFgUirZcSBSq8OMUtK8WJlpMVWJdrgL5kthDhJQJ4faGrNqeZOOpPKj4KR1uwoAqNhU+OWM2rnZ8CI+GK2R7bnfXAGlkNTIa5v2GbwpOPnWjwDgWEqCU9d2lbaGybTSqRC2mtVtkBzGIbLDKNC5WE4KMeqsMdAqO+Xz9GyHALSJJXtU6jINjqpWqu5q5XwcmPOtWKSqcj5PQ3AAPhwh419uFppVgoxADvYZjrlWi156IDE67baE4OkMy81F8xVYr3oYhVuSmlEmH/FskNXJLUiO0BgroWvCjt5mqzpPGst6Px8qAROgMoYq9pa0vERfqGJszumF1r+poX3tO8ouyWz5woNmNAe9Jr6KY1sWDJwveZ6UwBjpZQHdAaLTbXbJOX/cRskvpP57r06Tymw1J55Q21jE0LQFMYcGDTLWZKKtCnW8mGbabWwsf1iKeUNUsoLO4PFttEeKbNJHYR2Ybyi0PIZ2fbvi4fkDRn6MYWJnAvUhdvfB+TQeMBLlwdLPOGOnQB9kQAe6wh4LU0xwxuWjHRpbq50u5VI6JM6Zowy92VKURiOzZFApUu4D4xVFGT7qNEfxRiLhnvCsTfiAa+tdr8P8PebwEGenRgfdibxoTf2j4EzNWMGwFne92G/jz/muZCiMtBsnhl0znGlO2tu5guQ+ULI6mBTKx+EXtBkAS1Bp0/m9x+T6F4/+fSHP7RMPpQyxyyQQt5S2dRqueJkuLw0IKW8DhBrIHBbsKnFUkAJ+X10GvsDhDjFLqcISSYIE/sDst0umVlqcbwPJbDYZAXXXqR8NY52ufSS6QsWWzq/pYSZNySwqDIStUxWE57qO0rqYNa995d+NWzPmc8/bzqLIQ1+35VC4vdCyL8EIq222QFJg7/kXU2IrQJNUap3s+HnYJthyKrtg/czwU6DgyfXkmFSukmplVnXoQ62i/6hBo9AqgHofduZdtKvgLPQ723vWaUyYdJPghoJf441VZg2nDNaZnzMR21PlXoPzsAouPBv6Fim0pfXKh8Tc87AVGh4ABr+hFkqasOapP9HCf2JcLcKoTOnWvmEHQAXfLYRQSSZSO2/OTOdkhpMUCGzdOZNYC/MVpqI3iTNSzSbvZXTkbYK90KDDxItqGM+BFM4Y2Rb3lQFDxXOmJmp2hOOdQmhn9hRMTJbe5OGg2n+kM3fkJBcAuOIeEWhpTOnJ9z2FKBx1l1jt9pr0plS52Jy+UIT+3VUFFkOkqkQW0bWDcjTE6V2K9MWhmOPS+AwzYV920/zmvoRksLGdr9kCgRd3hGvLLZu9+qe7XtLMJkZ5uRazC6VIG37PL17JztfEZVBVIjdurF+J7tl6wtqOweLgd0dgFwcDxQbCb16Mb5W5n0+sJ2OpjtJ4KTOgJfmI0s8oaV/gNBmCqmd3RE0FTj5erWGzvDb33zftdV2m+cSkPoAtbp7UfDgTI4dK2d17Fx/DJkaj6Fhv+9iCVwpIc+3cvxsmLL7lkJLMEnRVql1Wqju7cX8Uydunljz/TNSqkRBB0nhmmy3HHtj2a4lunC/LSEjlXYz/eSgS8muVQKPV9qYIlICSoOAvCbXoJtKxc4BZ63UXQdZrTarEqS1+NqEwOpcmUZJQ5nvViEYgiqmBCMtll7fyv9D5PFB7V7Xlb9LzSNv8TfuBfOpaFL+WwLfyITcyyq0mYT9vhoJ3CIlIpXNUdtFlYgSkASOSHStH2EhICZzOmy6ggdVn/wOGXO/GY7EeyjGcAzGDjmWjafzJoWWVbZaEVKtNB3bwYWdLR056ciYXIqA6c0vt02vfhZ2RkLl0mFkAn2VDkader57w2Riy1QOEJpEV9iaeE5HCTS8BYEHbQbdJNWqw/o1BI7pQ/TMdCRwIObYpFcn/J4ENketijqx52wMR7cSfJir5ADUqtl9b5KLyd0OgTikijQy/55IMtKIZgBqF/dDnVqTxQzD1EIB1Tafzc+EUnWn2rV1JtwskqGbmCAlLuwMei3bX0G4vV5AHi8gb+2w8UHwzO/YBwmdeWK+FRAXdlQU2a6y7WmMvQ6JPXSBfZdVeC2jOAoa2+uE1Kldt02SVdQYm6BDvCKkfNhOg6B44AFX4ZqJK6QUr8WDvZaO74GnMfYkJA4SLjGh47QiyxQEKZ+SX2kC49srvObh8ikYPSOkXNmRy08m3PZIcqKrXRYPFFpn402aV04UTN4JaRfpwwAIZc4acce73y3L794m12KCfYDC5d4UPOgEyo6HN8xPV/8wKB0pKevPR+1yxTaD8q6XwFWVkahlutlQue8JSOwgBR60W3gs5Pc9CaEWszpRamJy5YMtFFZMaSwr3U6H/jGEeDcYiVp2/A1Txu4uNO0FCDDE8+NAU5SOdaaEp4zbW2o6U8zOyxU9QgdZTYgrJOQgTWJSRXNrpvNZD0JlvhYIbLeuK3+0lXBg0FDuqxKSTmvyymCklQuRWZLMwYGdNamPt/r7s48bO8bt1tjhbyV07YDAwkWWCyA1lJVQFXsPpHwlGGm1dWQlc8tLrtOkuFwmcEzlQ1Gr9R1YTk1Qf0RU/RSwY04mBqNm8Ch0oxBjc2TbpIBNrRVNDZNtfTCqVdTEROjYM8tBcQPUSGh4PiUczEW9WoDOnEpsizzlUxKFUKm7D8aclDOsGdUqEyl9vDbHGkyyWVBOoBorIPAualWSQGuqcAeE8oQ/E3Uqb4g5NaAz4RUQqLS9jlSpRGZ7oBtFtunVDWrwCiTGQuIM1Kvojd4k09s/BIHvoGO/HL8ptaU0VQ1PpY23XOY9JUTTbMjPlFM4/xlQHX9qefKcEx1SEG7jbPh4IcUd8aDXzLyk4LomApghgYhdOKgn/OlOQB41199JgfvtVlElnnAbM1IfK4ET7WbxhY3tl0rIq4QUV3cEiiz9qUbc81mx1k3tidaay+mUeMJtSwXEqtw+GO2zJRAQwPG2a9o0ttcCsgq6fmw8ONIyupF4wu2LALlNruiZgnDb3wS0E4XUZ3UEiy39CImK9NH0l4CckT7URipBa9sL6g/88rYqyzF3I6Df5EQKHgwTZI4CerL+2IW60s6ldx27mxyc5/5LMNJi6agU8vvoH0BTxKt2K6iG/CX3QQqNC09JiXPtQkxTCbI4a//OLq9EKv8GhY52QKwPNrVYqqPrjyvZPs8taNJ4NRiJ2tqWw1N9x0tdzXgHQxdHBhe2UOVtSshf+iyE3FsmXCV2q8KSkH/s/gLafyQQziX4hMpKHoEQRwodx1s5fj4wbfwWaxLrX5Eq0ytODjRHLR/ohuNLJ8GlPy8gPlrhGrKnxRL3aVKp8Ju4xkWwKWq5voVni4FL4t+uZaTIpip4MET6bbiwDgnlqXAzoipJlDnMYClwPCRGc9aD2Wp2aU61SiTGcMZDUadCbXsTxEDkKd8LaiIZFcJsmOYk81SwrS2DVFokrnZrqWZGtXIkpap9FwhMsh1Mk46fK3M6iJ6B30LDDSpt+qx04qHeJBfSYwjktaizuY4kTVvTILAXapUQaE+NWlOJz+jNlhE8Z2F8ykF0EGSOVYGrlQMrwyDpXMw1aCyT86EKCzEfx4EGWwqJ1BNtetCOT8GYZi1bp0tSGG6bKYU4Ezqa7XJwFIRjZwuoNbfe6gh4LX3EVHp1IZ+BpHZJfpRrOXpPY+wGQDDK7lK7peNVpI2OEDQRjlcUWabBp/9Jl+aipnxdPOC1d2RW7zfGrLjF8QqvbdRdYWPbpVKKqylMxyu91I6ZUhBqv0pouFJKXNAZKGJCPUsYZSQhJwxc2+W1W3Qu9bcvFMAjHQGvbZtLpaKnMBONB4ptha68gjFtXZ2fGBpG+oJaa3n7DrWP+/ABIRQ6DCGkV+6NjYA2UoZp4fajd13w28fet8wvECr3XQOpsv59EoxELdVXDWU+ZlzbUwpsL6ScG2xutXUAYopxKbHdyjVriu2cLpUGJfmZt9Q2E5Mr5rVYzfZ4LVWxXwWbo7aqScNsweyFQsjfBZpaLUPywn7fPbTDaULsV9HUYmnbJBfuPWqcr3DIywLytVzahoayktuFEDOklBdXNrdaJvUJlfmeE0KU6EK/srLJ+rp500p3TiTkqxLQ8wX+H3VfAh5Vdb7/fncSEAEVNzCTBaw7mYhVFGXX1rVWMxGrKJkJkgRtbe1iW5cq2k2xta22CgmQmeDSikms1rq0dd93k+C+kGUiWPeFJcnc7/+8Z+bGhNxzQ//6PPB7n6dPW4lhlnPP+c73vcvkM+wR9wYr5hy0m5PubYPijnhTywCfgP6oKyue/7uH1yxf/S6NYbfZwiOT3DwMLrrNs8FRhP/BU23Io1XGilwxF7WZ58AXGXnn9+GgGkvMuMEfGe8Jeom8MqQVeSZMjc8x/TpKAzkgmRs8xyUT2EEc4mdJ/NwdNWZ8YMdClMLFX5lejNoAtclZmIEe3AcXN+MG8/zbUWW6Oz+H4LRAnxQP1fgN1ChJbrEWaV7+jGIHODgHS00B6I9MKi8LcpJubwxUJWWyWk7BMtNB4SZNDwRrB3UrgkUuZdC8nAWOrfKTaxYonMWieLozXmj1U8pLtp8k5B9B2jf1fn7oe2ftZ+1KhZNt9wGOC+jwVKzQylcg8pLt8wVyjQArOmMFVCf5IpzsnA1x2UH5V2fM/jqJcLLjBUAL0ulN+62dv7ed8Jz52VWAnpDjjPha27zdrK64HFugZ1MSipVdlXtb1YDh+vY4ILWi7h86Y0VWziGRl2znGGQOckKHps7ItxpIkpwrjlyjqs+lYkWBZ4NxZV2/kUqfDUMVXXnJtnPf/+1p12x6pW9KuVPWlffLglMD5rIZkEzIbge9CqxpfVuA/j4ebOH6ptllw8TYXvuoN+ROXbBqtW8OxYpopNqhPkCxVoGnKwJs04lktIQV4hR1QxODOgiJaIQzyj3Nf1ydFb+t1ZedTZisFFd2iTc1c9bFGyxnZwwLo0SKbVx+dnPPm1F0wIG7jr5LIGkRWRJraLZtUsb46PTIHu4xe+1aHm9qsfk68PObJ4LKY/fereDUieNSFU3BHJBkWckP1FV2GJbHm+x5MYlohAURzZSWxRvs8t5lcybuHEo7TwswwRk64t4gES1JAXR7tdvR182ZNEl6009f/J/X3+38ZCPb0kNuglsJfA8cP3F9UvHFQmpw677StOEvow09BFcatwgbKnEOBFdDcFWgB0XGXpxjQqbSDpUVsgwOxkJxMBTnozbAK2QhzoCLK/EuenGbGW+x6By0ns2oqMqQfw/HBuwRMIYx6xlToCgxXRm7HHIB8vE5XkOj6SGxc2TNXsoG6fFz/MWQVvBE5nPld/CElUzLDtJww2nhmqPFuX9HhKjGgXCN/wp5LW9haUAR4XFVHJyOJeZ7oy0BP1drh2ArghcudoQCvXMycfR6B+C8nOv2HramYoKvbfwe9e2HOC4egYONmpMzpWtuntUDgyMTgYxWaEnaHXbE2oo9rHv0HvXtxzgQFu/3BuWlZJUuT35y+58/+bRhMS8H3Nv5nLJgpxkeSfUM7ZucV99xt6jOFgQG1Jn1PHL23Pt2il8xW0VP6iov8iwiNsew4ftPvdIZPea83Ly9X/3ktj+Q9Ox72c1Ltn1DRO4Vxc2dscJAjlR+fduVCjkfcL6TKs+3dvfDN3QepWn3HoG8NXxj9+SgrggRTrRzrJ+f47gT2+bZ027z6zuOV9U71l1wVFdv1+semZTCE2tB+T+Ao/0jvMKDHxb5HQO8N/4/wBabd3vyDZUxYWJwb6MLgYhOjTW0+i6AxCnFR8MVbnxsH38w9HghshKCM0KOTpt3a6s17teoUgTHQcmMtxuZEYmyyL9JOtOQu3fFqtV8SHnj5UGduYllWqkrHAc3//mEA/bcPjdnpEJp8U5dui/KJ+VfVf9C50+mF425++G2D61Kl+xBzHl64oR9dttQeuDu+bYCjUiUFZ8KlTqo3h9varWa+mQ7ImUiuCuI00IkSyOPqaAEovNtSqP+SEYjTyskL97YbL0dm+C5dDcD+l6INxnu1RbdvrYSSOrkTJLrmIUgyYIDD/WFmIU07smGpP0DNbCTjjPyTt7c/4oaI9/0R8arg+s9jRzMwnXZhFw/VIEmcxyZ7G6SVJcajok/+FpdI/F9CmvwEu4xnaZB69m8xxhcDMd3kMY0LDfFlz+KEEUbGnAI1uKZAC+WRcjB64bKmoNOc3viM+JfeFQbPwnezFegBtYbZB+o+Mlk4LyNkZiMPxii/GBkSK8cFzWhJsBVlP4r5NVkOh1jAgu/KnMRiUFwHpaaYsNzLmUBEmxjv3XAw5wHuX/2UL/D3KgdQ86hqTPzfRVB4+veHdfjbHoS0DxF6LiuWNjqa0FXUhHsqVSGhZwTU2fmW0fQWyqbzbupa1fp6WUHI/edHx16jfv+Oj6r/L2mnZ8dJbHAqs2v71ivrlY4Do4PypQxhTbw2I5zL8Goo8+6MBUvsnGqRsmw7Z7MLThg390ubnwjVVG0P+AfUJe3cs3XxXUeB+ThVCzYp6Qg2X6OC/zFhLnFCqzk3D3q1+wfUnmCTfu0uFPeKR/vzxHLwiiNxJnlQgPJufl1HXuro/QfuTNVXsTLlsfpGpUl2X9ZmFGfV3jwQWVV2Oe98f+J/pbpg7zdV5RF9nQUvEGPcAWnVDT4kw6TpQfuo+I+AuhDCoyqaGy1zgyJFdGS34Sg56uiKt7UYmVcZ1UZZPCOcdSpLG960SofqyuLJETlTFcwdf7gUciAjZrqjdteXjdFRDqbXlpHkhoXO2V67CDxIOCM/OvTxu+0etb4XS791QO0wzeteX5W3Lh4C+EiG1D0nXNowVPXPdUxeeyo4bXrPttkLRLogeK4VKbIS2tKmksWWZwsE9HIxTx+BHhxKP8TGr4JZJYLBKYCe0hGS/6q0G+7oZyiIOv0RDTyFqC98cZWSkc5lqJT37ZaeHDz4ibG98NCmsXAF6ORChQg10g2U3DxAmoDbriZVFTeoB/AUtNd8EeGU0ADK6bDBge5VeNnUJCRT2L4vYFFTzX2hprPm/LgtagZMOYYWHhUYRGacSk+wHK8ZvYF3/WMEG7B8fgT7kAetsPF2GhGQ/7reQFex4MYh9dN8cZxlX/hkRmFcBN9CDWmgxqMKqPQ4EVjg1Gm2Eii7AoxjZdS/No+N0Z/kMzq4F0opiGNI6wEXXalBPOghk/idWVYpNK7he/NegHZivAk7LRQYATAAOx8w+s7jEgP541gV+Q4UwPb/MkOEhTJEfpxqrzQOjJkxLoCMwXYWRzn2iCvkD1v+WDHTRs+awVkWK7be2CQbDac7Hge0APUcQ/fLEyuf+HxVjjRfvGndy1ZlH637ZbP77+Re6P/egZuGjlz7ujPH7ypfuQxC57+/J5l5J/4rmfJGX6r9m4q2/H0ize4H6w95tN7lvkSLzO+GqHnOYZKxQoCZeB5ia6jRXp5cQ/Matlz6Zs7btoul4XZngg5xwQVcUQ40V7HS7k6oVO65oWtSkgsUic8oeM9VbR2ZRxU+Xu98Y2xx8j+7y8Dfk7TvMKDg3b+4i9b1bCF5wWKDXI6Y1ZKNvHyFzbb8GuO22v4DiNGPKwiHaK6V5AUlaiPlpzlil4PVxfHm1p5sPoiES0+ASo3Q/CuQq6uaGy2Rm3XRUsWieolKphvySrp26iT0eKD31vfc+RP7nl1X6WTY4Y3wi+Mt1DeAPk+i4/ea7cjJ+6+/c0i8szVj67hQ8HCg7dkjnwGpSXWlUaWvPTfTxdc9cgajsDIJPdty6+cM3GvdK9jbqROjhxcvqrZN6ExW3Sx27N2e8c94tRVqw25wg+JspI/QZX8nPp4Y4udTJlFXbT41wK5QByUxm61k1QTpiOCPd3e7vFZea1ZhNtw4UHyFTtiXMe0DGbx98V3VYX7IOa5WYOlA3MvBmA+9kUOeMugg6ddEpfpnvDWmEYI38aSviJ+MCpRCcFPzRhADQfEn9NAMOKeRZ6Yw3SUj8T3i8KjEj3YgHow4SFgPRsV0lH4G0aiCLeb4sS+nqvxGF7AgXgF0/GxuZBwcx1ceHAUMswcAl2oMcTeYGRs1rn2w1Ach9q+gMqByHA/Ts2G3gWrcjKkXz5z7IqSK+P/OzOmYyzU6F7bv8DwYue31awWclG4Vn3tE8KJ9mchWqyOzu6aN97aOQ4nO1YCykTw64KULvnJjnNVlGq8Toi2dJbb81+IcKL9KRFMSguOCLqZh5NtVIN8QwWn+IxC+gqPcKLtkPRH625c+8MpIagbuJ5Do3cqGvP95Te+9+synoP29UyXy2Ejepwddgnl7Fbwh00vP04yKw3FBpw/e93w/g4b0utbAZXuzz7d/7/fnWjdc/dY9laRk5vzikDv6YwVndz3Bz7I8GTkIDjOD1Lz8uv7/sAHecm2SwXyM4hzYao8f3Ch3w/hZHubCj7rKu+T7fYvPL5sU8IDSd3TvcKD1S+NxL7sHIdfrPeg8kvtq1YT0eJaQChhWx7EK0iWRW5RNQ/EoY7qTJsUlMiOY+4SwU2xhhYrUW1l6cQD047zkCjedoHbg7w66qORuS43E9HfxBushYzZqI/ea9fb5paMm6iQ9AX3vnbt2s82UevOKpmtcuY0kJj3uAjejU8Kj5w5YefX4o0trGT5QLPlzk2QPIIBlrZ1ZZEfQfGbe994r/7m5nfYavYtPOrnlYx0P1c+nGyPfaPi1lbfUCta0YtqQoENKqGpQf4n7IowHI6LrqKxJXAWSSRKI2dk3SF/EW9ssW5AibKSOxifHQq5B525arWnoDDzvm248CD7n61BzkO5nvndZQpWJqOqyfV4F0EumudhJ6w3ngm5cHEglg0sxvuQkc1yXfDQOz9QYlqNKJiVwZAyMWoT69o3qAZHmxyl7g8X033MtDKFxx74FU40XZQbswcuD/VB69k814cihUk4GI/je2gxYwX/9UyC7Mc4Dnfgr1hv0ojZyqaixtuov7hFVZqslhGo2cKxW5UpXA+A4CdWb5Mq/NCMQUgP7sF0JALHVlQjkHSXbz7f2ux3vTmqcQnUrAVyWjY3h/PSaXlDZjG3rYHrimM+cnlopdCH/GT7PSo40nFxVEe80Nc5mshLtl0hKrTjvyPITCsv0X46RK8WlXvh6MhUeZE15ZvIyGbxbYWcGiSbzVic65mQ0E8t6bmm8NhxweLTRs047WYB/t5ZXkjpuH09AxeE6zt+semlR3Peu+I0rj//9cwbyK/uvXPdxUcfn7NL3ure97tYtHDfZ6HMy3af+WJ+fXuzqo53VA6yubwSE29ZPeyjDaO7MiqfYKVJXqJ9mTj4FlxQ2hzIfQon22KALBHF8iHzb+o7XoCru6XiA2S73AO87uyXpWF44BnF7pcBjYs4d/2ykhlWR17bhwQuQ2BJRIt/DMj5Irgz1mDPVakrLV4sjpCmdjhcOTZIiposKy5RlacEeCLW2GKdwS49cZ9dh+cO50PEavP5eGOLVWpDfX/jAAAgAElEQVSV/PYBByEn9JQCf4s3tgSZ/5iNOnZQ+KPZ48c4qjqz4rbVVB3w/TNYjS1nLuzrQyGcNiIUuuGz7nQoFApF0+k0FzkPGHImyMXgwufBZeaDdWWRk4V/plofb2zl7YSL2rfwyCpzJovIebEGf1fYRDQyQ4H7hVRyxaz5TS1W6WCWzMvuxcuxxuZAxjlxw0mRSG+IHijy11hjs5WzkCgrvh4qla7qyfObWvurPfg58CDaVkct/Ay4dujFwfVMd8M/ZUcc7H58jO1xZKCZWDWeg5rD8bAAOaiYrgBJj4LrsNQcWv7I8B9oEEYVy8gh3TarzWHPoLpZUExHrfnMN0em8JiBjdjPjDioDOC4Z9B6NrflXNShByNQgt+j2Zjv+a/nDEH2bDyKS7HaxMRvDm7WmVZ+JR6BGJOyfbBkC8KoMoTOb2Z5Lf6S7UqwKP4TFNshhOmBoXdUJSlOg5rv+k3Umlb8YFTjJ4bAq3gZtb7cD64FjjB4KNguLlsTXuIo9xuSMQ0yMetyOuB8IxXL95d3m+Kk7VwFLhbI80Gy2UxImfNPcXWpAoeO2L1g+hvHiy/xkggn2n9DpZcKfhYkm81PdvxMVS9Qkeu7YgU2sYEpPMYtfnh9aOx4enWQq2Vfz5lxy247f2/JJx/8eSHfk/96Ngd/25XY+NmCroUT2dXi+UTOBnlf3P9ZeJgxc7i+/X4oZqjqjCDLeCKcaHsbIt2pWCFJ3lbk13dcBtUqRtwHSZuJ/GTHcQqSg/WuVKzIn2ydRTjZxgiSQ4a57tjNSMT9Cw9eXL6seRhhVFVe4eG1BzmbtBIYtwB8EL1Fy8qpa0VpyZGO6D8BeToecJjVRUvOESjJWKNE9IIgKWpWsslZ9YfxxpbAL4uHswA7uIK1FQ0t1hZW3ZyJ4yTtvEYWe7yhJbAdW7TTiKa2jzacPG9SXu+RE3Y9saKpmUUNb188jCg35RfGhb3pyqP3PW/08FDR9+98+e1eV7ngWSxwYbOVRwURb3+Uil1bFy2hvvkRhT5Y0djCL9wzZCOBcECLsq40UiOCExW6pMLiorpizsQDQunQgwrNUZWzK5qaWcj4gt4bLuQGAdY5KlPKm5oDN39j0sYkUeiLQSZtzMpRwWWu6sXzm1rJMu+Pbb3w4JyThRo7BGR3n48FeAkOpYOmkGVeivUmgyqj8OLheOIQDp43GsMvxe2bte0HYgH2z4bOcWxSZEYhwW6bvNlxnr8H5/ABklSOBX6Ew9CJJ43SheMv3/WMk7AHdsYluAXv4XPTpvZfz1Vm/MIC6vuoMb423nPKLhI7C190PKrMJk/i7SEBxdkXqAQPKbqO3o3avtjugajGN6HGebEXglOwtE9tNxjV+A7UKI04AtoZS/vyKQaiGudAsQiK99CDI5DwLTipLGDnmMWQtbO7FcEujndomVusCT6DnKfAmV0BDqL5yY5Sha4EpGNDaONhH5y5t2+uTriucxIc9z4BlrvAmY4j0zvnFVijHfpks4IVneUBslnKUZUGdXJXqrzAatUAJ+cFuL0H7v6re1IFu+0y4dnqQ1h4+K9n4F97XPfCH99bPK9UP/ngmt4PUnxGBq9n4FoTZie4yBHnzo7yfI5gOGYlN4Trl+enIY6Gk+3cZ0tF5PTO8gIrj5AI17c/CxfhVDzYJyScbKsGhAZt9EkJlAwzFTgk8phmLNb5+qzIS7bfJEAZnN5DU/P23PzZ46XXI8PmhJPtj6VihcHJ0UODl6bZXuHhMbEHEUL/R3gbNRGuO3nSenHSJt1TtGdSrOkVX3ltXVnkeHH1ZohQXnXjkHHw0chLCoxN9+ZEzrr9easzJA3KRBBRRe/uGzbMOj7A14OmYwp8GmQ6RhxWMOacNR9+/ud1n3XLTtvlvvHRxh52RngIUWrLmzsLpotoN3vCPrvt++7n3fttTLs/b1n7KT0h+M/589yQOJfkIWOkHYfn7xBdeFgRH/p3s9bpLOJ4cLDa5miChYfpFiRKI5QNcgRzd7yxxTf866YTD961e9imB6EyGoo/xJtarKFG9aUHTnOFAX20d3enVdy22kooy0IS0cgahWyqaGy25otkx1YrIFK3WSqth2191MKCip8LW62F2A6/QrmJmB+VJX4GGXSRlMYb97nWMQBB/oGLuXDwZCBPpMo8n3TwXE3raLg4ymdk8gUyJFWus4+YioxaIy30wzcwGnfiU3Oj8TZc3/WMPbAOI1CFsXgQj5uuhP96Zp5MFLnYBVf7qEc8r58MxyPjafIjCL6DpcZJNRhVZsTBUSmD37z580BQCpsh0rIouwQ1xqzMHwsxFa7parE7w/1rqm8xV4k4xBRo5N9Mx/XG+dMP3tiar9Gvy7O1QR8kT21jRuvhZDtj3wKDzzJZJe4jmXFt7pR3yvN8R+D5yY6wqt6voo20QgecY4I6KCZt1pE7oUybtctm85NrjlM4twPybCpWQP6GDQsQyqlBuleckTuucj//mJ0rvs/B6xl4ZNiESWeNOmHh/p+suuKx3nVr+MwMXs9sYc2/4vJRM0+/ECqrU/FCdmkZtMeigt8zx20sUB4MJ9pZwFYp8NOuWKH/qC4LkykjMlU3rJ/QVb3vIAWoh7y6thMl5PwN6rZv6t1+8ntn7WalQ+TVv1koOuxZQDeFcjTSfkaRfwxD5u+/SoEfp6Gnro0V+T17LMRNVytct+YBOM4hw7qH7/V25Vj/cfGWwfBGvMKD7X+S5wYRQv9HeK1pIj8ZLf6rQiaH1D1sniXFlbdyJ+2wGmWBQmdQ+43PdEYi/xHOiFz3iNhtq60yPxNmRuMhxQgn5M4qX7XaGg2cjEZeUGDcJ0OYjiXnHBh20655f46iJtbU0r8lzsXN1iVvQTsvOXHiYhWJDw+B4wUuXn9m/BeEWnZwxkjIKYmtepG2y76gHbuIXA7oq/HGVmsHKSMFlkJR97ZYkz0gb/mckn1DafIYdLQKojalUX/URSN8iMd3h4btWb3qWV/tODNwXBf/EODegIC8bb3wYOeLFToL4vEoxts4wnQajkdtAPFzIX4O1xSNvw9UmlSZIoZF5Nv4ANOwKsBDJ0Nkfd+MTDJFh68M3aDS3FLuhINHoGgNJJ5Wgy3hSfgQY7FqwAx3wHpGKQqwE55ELh5Gjeky+K/nSkyEmNRcSlaDTc8y759t9Uu30KuD3RvK5ln0HIqawXL9bE4Li0VyZRKBv/csFCFkeDK3GHt1qlhqjepnIKpxCtTIjEea7JulfXucH3gokJzI758jrG0N7DZ5eyyLWd/LYH/sftNbY3N7c5+B6lh19ISueUW8CQ/GLRrK39hxP1SfUJEyiHNZEPkxK5t9CoI3U+WFVnPGvGTqIEHvY1D5L8Q5KBXLt77mcKLtXohzJNzeaamKCZTXehi4noH1Yxc/cmbO7gW1m9584er3fnmS/2jNdBs6ZwP6b0DX5jjuIf08MHh+8sw0/z+cbGfRfplAr+8cwiAsqzQ5E3BmpGL5HOf4Im9l19fF7X1UoN3pgIKPyLqy8pzNdwSHBWXA5Cc7vqfQawXy0wB7eU96zffWDcc5NDUv3/cc/x9gxjde4cGuAclzfbyM/094ZDxcdtTeS4t23G4BoCfFG1t9/eiXnnjw9sNzu+kiSCXNO0FOl0TW+GuuQE8Liq3PEh55O9lBXHdWUIGSKC2+ByLThjIdu2XOnND69MsPALIrW7LxBrtBV11Z5OeO4jIV/DzeYO80eEhGSx5W6BGimBZrarEuwhWlkZMcMW3+90PoPWxe48u+31VdNHIj3V4pHYw32Um3NAjL6XUehlAqKhfEG5uX9/2hBcnSkjtU9BgN4eCKVS3mNrA5kqWRw9XBg6J4KdbYMqnvDwbDKzy2Vct0j7PE9uye+LrJOZ0X6HZZjTOhWArFrYEOngtxDFwjK30fPTgcdeY25o9q/I0FdHbmbLdYJziOccwohvHl3agxclt/VOMmuCiDi4Ox3ITV+YNx9DlmpEQZrvWAMOoZRcp4mgxWzgxEJWZCzPuoQ80WWIsvxKFwTbvchYMjfPkaargyLDp4oJL4affRmIUc7GO6IvycKswhUGNuwQOR8T5h8fmJyaAZuivDbhFb8Dx4bBv61gS7yV4omBmHD/Vi8uvbH1I1nePAgLhwfcct4uq7Sq6O4F+pcjv5MSsJHVI2W3Bze57bLU8BurNApgQYfyE/0b5MRcuZWdIZK7CeD8S4RNvEHJHnFfK3VKzAukfSL8NRk2e1E+BMtRUJZgzk4i9wcHuqvHBzwvEAhJOdlwPuLyBOeao8n2NIX4yve3tcj4m413GqOLErXugpRn0RTrY9DHGmqKsnBP2sZxCmwHVdsUL7M+Kl04qgINl27BD+J1sKM77xCg9uepxhc75rb98ODU9+iD8ct5/uPGLY5bHGZmsWQ7KspEGVnRZX15S0zrT5TxDJaPGFCrkI0Evija1Wx8EMT8LEF28UR78Tu3UAmXEA6kojy0VQEUrLzHl/t4fOEfS1UNUDRIQEVSvxNFE2sQzq/FWA62ONLdZ5pYdEWclNojhZxY0HmXTdEJ04uRfsDGmuwpla0djcv5rvQ6IscjXUJIN2xBtavPmcL5LRyL8U2EeAZbGAID8PdScX/8VxpErEjZY3rN5cwmZQVxbZT5SELFnvhkKTgjw9dtou97WPNvbsvQ0XHhmVVg7WoRdjMQEP4e2AA7XKdEiYQ/FgoGyzEvtAzJiGxcR01JjgLn9kCJrkR3wdLqqxLODgOxc7YJM5TNdAkIdhmIFr/Z0Us3LQn0IxB7WGIGpHlTHSGoUPsedmXZGBYKYLLxG1JpnXjoynyItQPILaTAhVIOh4GjLk253pR4ClmSDKQchwRTimpLzYzgEg+LOK9w3pN2NUxs95IBaiGGoC+ig9vQI1pjtjB8dmy3FBVteQGSVteyC50iNlkqfgK7/3EE60r2D+kCp+2xUvtI3rmEp7jYibB3U2APp5kNqFCCfanoLIJFdzDn8nnuefaXTLLaHwhsOfBnSiQE7ujBVYrf3DibYLIHIJBBenygut5wOx6/L/jh6eu6FNXLR2ZvwqfFF4XduY9Eh5lBH3IjjXlqBLy3gHuMUFnuiKFdr3B/Oza+YLnOUicmlneYE/KTqLcLKdhOt9jZlYeUHgpTBc334z1Khdzk1V2D1V+gzCgH+mhkjlHb7PwWs2vfZsEUQUqn1E5C8JFkTf9AoPtk0pISraXDr0P8IzXMLio/e976f3vuoxYgehrixyhXC+rBiTA5l5ZmOzteDJdjA4p6WvhFWVkkmlxZMQ3R7QC+ONrdYvK0t6/LULfHd+Ywvn8VYko5FrNMO16AwKiVt5SvERaVceVsUdFU12IquH+mjkly7wAxEsijW0WIOFboiW5PeymFKMFtGzY42tviTBRDTyUwEWKrDJDeXMCDr0E6WRm8TBZIX828K/GIC66MTzBM4VjmBReUMLGeKDwDC9YTl4UiFj1XUPD+KKMNfmNw+88fgb76/nGtxWOx4s3P5lGB2fmbYqlUX+kuFMMUFpM29uE62x6ZlbOT+XvaA4E7WGYe+PKlwKwbFQQ/rm2CZwnaLKtEY5rpmcjZr3J/RVm0wZ/q4LUGPY/nZUmULmIDjYH0tM8qo/qsx4ZRxqTNfUjkz3hK+L3ZNAQyWDzOfFLiotsH/jWyAQmVTg2VB8gDBmIeASY2SzgvHZn3jbV8GSGdmw0xGC4K9YOgRRdCEq4Ro2SS9cY0z1hfR62wIPO08hR+mwlRydt7L9J5LWi+HIdanyQo6OfBFOtvPPjlfIIwJEgrgaRLi+41aoMm02WDabiXmfJpDzO2MFVp5OuL5tDlRuoFVDqryQpNFAhBPtb0LgpmKFvPRYYTgYGS7H0lSskAXbIOxR1z5dHKoG9fVc1z3IZi1PFCTaZ7iC+0SR6IwX+pOiszBZLSIzxHVXDJU2a+TNEBJnf2d7nUR2FMMO1+qhcnLyE21Xvv/n6h9teOZuL0aF//1VgF2To73Cg61kPthDVsBDgHHL3u3N2j1JRou/oxCOIHZ2RWb6OIP2IauK4Vzo30FhckQiGmEbZ19Arw+Kja87KXK8hLhJy5/ijc1DcEqKLxTIWar4PJ3jzrLZljNiPjfHeV6hL8UbW4dk/ma5Gmx73hxUTGVGPK8+KEC+q3p9xUBeSR+SZSUxVV1M6aA4Ot1mRU9kDcKYPfNSvLHlpL4/sKC+9MCoKy6Z2jfYyKy3zJk47HNXnhSVAxxBaXkAV+TG6EFFvehtvfg/b6Q7Pt5A6SEPNC8TYFtCpvAYgfXYYLxl/Nvn8zASIwwJbUw24t7+DFWbIDUWryQ92m/QGQXFuRAzhmzA0iH4AlVYYlJxBUfBwVFYYkYOg5EZHfB5WoYaBN5Ks2qbUyE41He04SFT8ND8rBDLh1DFVRmi9E4YjgnWbkx/ZMLX+DytQo35/AejCr/IOogSVBr5jiANPNls5oKU7zuK4hhmX6MeGgPBI1ga4EhLZDpd/4KgFkuNuy3VIjxYrBefrQiSIT3ekXW/z6/viKoqR7ZNnbFCq9NrRpFi+CzsjJyWm07PWFMxwU/tY5C3smOxuPpdQH+UihVZC+n8ZPu19PPIjAMKrDypvPquaYLehwRyV2dApouHcLLjMUD31Z1zCrpOzBtMIs4inGxn1+AIVTzUZSkSyFFxHXlUVbrdnNDkd87I8+c9kUBZv3b3HO15C3AfTMWKAl9nhvQpp0L1vlS8MDAqJKO00UsUzqquWAGLDyvCyY62bDcqsCOZl1xzvohz0Xu/LHt30+tPszgb5PnyJUB13zFe4cEbCO1lAyvgLQDd4Dymv2/hQTt0iPusKlwRjQdxNVacNPEAJ2RcOduHUpskoiXXAfotVW2saGql34Iv6sr23xua0yKQe+ONzZSrWpE9zK8ENKQi0ysaWnwDkP4yZ+Koka7zChQ9az7YZe9FDzzQZyLjB+PVwRRP4KEtKKZWZZQ5el+8sdW3mq8rLTlWRHlzUFU5uaKp2SrdzNqmn0Wi4i7dw2aceMez1oePMIoXx6U65sF4Y7O/isB0UIrvAWSyAj+raGrZ3OmvD3UnT9oJTvoVgbwXb2wm45rSzW218GCBwNZgRtUCQ9IcnI7MG7maMeMM1GQ4Tr6oBFvBHL8xRo7Men9UmsOeN3sSyZ72UYYMRBUugpq8EnYbfoYawwMajIwyhmOY+61Bah6qTGeHBwq5D/6/j8h0GngwfzOQe0LQipxFTAgRXG8uO8Goxu+zlvAktPrP4dm9YRGXSZudOUSBNMeoDxTLIYY0N81XwZJJ+mURx3A4f2mthyrDjeP++R/UGPk7iykqhPh6rZYAWxFcd17XjpfNQby2cN3bk+CE6DL8WNDoIMMVMJ5DLPwuEVdmdFYU+PK+iPz6tkpV+ZNA/twZK/AvIvn317dfBJXvK3B7V6zAmtWTv7JjL3WV3zczXYK4ZAbhZDs7xScDTiQVy/e31v+igxAFtCMVK/Lt2uff0rGzu1GfEUgB0jI9VZHvO/r2EE52rBNoe2es0BqeSYTrO8+DuudD8FqqvNA+rjUFStuZ9DMRxWNDSWzDyfYXAd0tFSsK7EjmJ9qqXJGrHOD+zlgh+Uo0kWT3lmv6qwAvpMd5hQelYZRFcpZs/UK2ANQMe/M6/8IjWkKfij2h+HW8qcV647vxhMiYnmF4UQUjNa2T5v+91Uq+S5SW/ARQbs73xZtarNV5XXz8dvLJ6DaodMWbmgMtmRMnlxwFR3mAc7Y1O97YYmWyUxXjAuM1rZGg10lkOSgPC/D6xl2HHVhd86x/S978bOQaR3E0Wd+2bBWT9JrufQiQz6G4MCirJlEWqYLqIjr+hkLu9HmrVvu34rNY/u2SfUO57lNQWRsradlfLO3rRLQ4CcjRAl0Ss3iKZCF1pZGXRbBzurf7a2fd/ipvypyxsv1nDZbbivCyh7iO2ZHhATvQKbEajMOeA8V81Jpi0h/VOB1qfC/uDFR7eJku5JYIurI3aDs82awa/wg6jlrn8KgyY6AO1Bg3RjuqjUcGb3yXDaHKYRFFGeG51hGIhypQ3UC3y5lDqEIyqDLjjx9D0IqlFh5INU5iFLm5jQlKh/BK8bwcSHjkGIRF4uCLRDVq4Jqf/dQoWGwjMw9VRmHzFmrMmJkgB4a3Q3JMrMmiWxGU5XvjtUGjdcN/yNnwJiDvp2IFHDP4Ij/5Voki50GBXKJwfy2ip3WWj7d2OY2hleB2KJpSMbsHR35yzQKFsxjQ522HPjG2fu3IHLf7ZYg4I0LbH/DGmbv4eop4yE+2/VZFfsYoiJS/dNQgP9nxA4X7Q277Tq8e0XFWoS/5NpxsewyQSQI5YygiazjZTqdoGSqKnl0mqNYp8EFP7vAp7861y1YpQ4aYQ/yV7T/edPAb39/b2j0MJzv+I9BDho0YVfjWqTv7qhCJ8MrOU+G6CSrhUvFCTi88l1uuaXbxvgqQwH28V3jwZkVSFhfa4Idxy8GZrTfX50Y9YCaciEY4XjkVkGS8sdk6MySY68FCxnV0+vyAtNm60uKoI8IPqDnW2EJVjRWJaIQs6jHbh5oLTw2QLmZD6vh3DhPI/Fhjs3WhJqIldwH6TXGdI2K3vWhVzxB1J08a74j7tEJDroND5je0WG99iWjxBYCw2v80Z8T208+88clBD9bK6P57pJHzgAhdSbWuorHVOt9LlhZ/S0V4MJJxPzOokCJM4TfcfJejcpHz9TMan/dtI2bTbmmFfGfQyIhIREso2z1MXXdylv9hXOz+DxQeXMcsjDhm+qKwW4gfwzUHMw/owSMYD5WYbOLaWZTXmHGkP87CXgiZooNjst7sDdqOhTgSrjlsuVafQ43x4PBHhiA6DDWmvW7H2TgYafNab0SNsZf2RzWY03EPszpQawoQOxg6x+5JCOfg+gBPDQ8LcDoc4yrJgo++GoM3y2q6G5vQvQ+guAC1/cL7NkemK8Gig50bus6e4JvBUmmkzeyK5MDB7EBOC1FlOh0sJ/tzBViocB7O786XgL2VwYLOK04HXQ7zk+2tKtg1N53ezzYyGV/39k49odBD6qLeASpU9JqgsUl4ZeeBcNPcG59JxYqse3Q42fYtqNwKkbbhG7sPDYp5z0+2PaOQ/TU35+CuuXl8Dxy08bMfRH7OWIc7K1Tdy7riRVZCZ16y/TuSkXfvkn6v68i1P55CjtwgtVfWIOxoOrgO4dUxarcLb3182L6HjkuNeGIcTj3VeubQ9MsRElkREsjUzliB9SzJS645SOCws7o+7eZOXluxx6CulYf8ZPtNCj1FoYd1xcZbu4EF9e3HuMpCRjp6ZdOh68r3YkHNZ5WKs6+y8DASXa/w4NyVRQfHGVad8BaAEcYet2BA4bGitCQmomR5/3OoDJC60uIGETkWohVBSo+6kydOEschP6RrU8+mydV3vDZY159FMlp8t0Km5yLnANshSlDiu11u92MuME5ELos3NHMD9EWyLFKjQJwkqYqGFkoj2ZrnouQhRZIRjWZ4MM2pi4/fJB+PehYi/IwDD/4+vgY01KOYXumTV7NoEZzxzREe3CQe3h9vbLHKolZES76e7bJsVJXvBjmYekiURZ6ByiRRnW6T+CbKImxxV4FKn4bmwNY9R0ZGEy4yL97Q7KkojKY7K+EObAFuJbB9yYOdr4+HF9VMtEfmwXeikcwCNwce0GdjDNLm+UojjRIrByLDE2HRwc1uR3TjKCQCQpkyZFZ6ULwAxUeBXZT5eBSP4mC8ahRnPFiDXgNveE8F5s+chZ0RMjdlSlaDi6NMEZE01uVL+2ScdnjyVcF/0YupvgTZhYYYStIrN8TlW0CQJUn0OdMVUVzum4OTIYeS/7DjkCMbopIkdkxAjTFd7A+OWekhwrVjlTRuRXBc6KltBshpTVaLYlrI1Uj7/CLrpYgBbQqnGdCDRPFMKl5otYYft+Kd3UKhHnqjfJwaUbAfThXfw3eP+vZDHFcfUcEmN43D184v8vKcBiGcaP873YA/uvmyH39+93KeM9yfOGphZ2xAYR++sXMSet1nAL0pFSuyxjrk13fMVNUHAH1H4NDbgnxB7k880/qQl+y4QkR5GC9JlRcOirHoj3F/fPqf718dO2bsL+8p7IwVWIvYcLJzF4H7pKruCgeVqfIia6fMGLRBeebtoU5oete8sPVSnjUI+wnEOTVVnm/9nVmnWe4Nit7eqamz+hxM2d3lZZLdFDoRfxVgMf4tr/DgwuCByFQ66xe+BeC/71WIfYs6m6vCB/+FeEMLeSBWJMtKFqtqJaC/CpLNZgPS+FrHuCF3yvwvgscGIcv/OFvd0OyK217wJ91lUVcWuc1RHAzosqCxAb06xLS49eJ+r5NzfnYd2FLn7YoPAV0M/5PNVZniAAvLG1usM/Ns8N0donBU7Xk12TA9Emlfjze2WsOXbvp28djuXDws6gxzRa+pCFDPeGCgG1S/4ahzRnnTi76Wv8myyPdcFxeLo+9s6h4+tTqAK5LtinDmfeVmrrSG4ZxVgvBg39ZA1z5K+Pj6aBTEQ/tWVOMAqFFxkH8RyA5HlQmmihgHkCCvjErcATEPd0GWHGrdqPBDjMDneAiKd+FgNJYaiW+GWrk5KrEKgm8hibuxybT+rWsPVaaYYBFj9+ogqkwhxgRZuvHakXEFZaehETWwrtE+nI19kTaHyKjsSGZwwXsuhmclw3yu7gns8hDMdFH0mgwYdmj8DMWqcTzUfDY5lI4GjmyIatwBNR4ve/kQWXmwcjzLEWKgRH8rgWFh5OUQfb5Necm2GoEzX8Wd1VVeZOUphevbr1fQDdndICLDUuWFdq8ac6i2vwTFWGc4Ih2nW8YWtZ35GOY+AZGxqu5xXbGiwd2oLPISbX8SkapPGn53zae3X8ORIQs8bxzG57XvuyOhM1e7X1fg+VSs0C9XxyCc7NxHkebY6D1VXZXtivAizu5QH7E0XN92HtnXk0AAACAASURBVFR+od2b7uqq3Jv0BKsFQX6y44+b3njm3I/rLvx7d+fLgTyhvPr2u0VRrIo/BkmWD176TO7aEbs/gcy+Hw8aGRUk2r/rCq4V6AWdsSJfQQKxe+1bY3OHhZ4EJM8RnLiZVwfHpxxL8gJE6f9XgdsBnOgVHiQEMWWP1Z19cxwaHNd4t/O+wiMRjbB6HtnTqyWVt7da51bJspIfqOoijgQqhpB4JqIRbj4zGN9sS2UlEqXF34fI1VD5UbypeTAxsB8S0ci1Anpq4O/xhhZrml8yWnIKoDe6qisqmlr7v052HdjJ4I2CxCD+jppkaeTPrf/97NRX3//8jttffpftS7bz+PDzVsmCj7PWZ8aMyP3L1cftx4O4G9AfVzS2+prLZEZW8k2Bflz4wS4zZweQWRPRkvtENE9V/hFvbA4mKZr3VvwXFZwpkItiDS2+c/usvJl/tjFXMPWMgJFRMhq5XLn9Q++IN7ZuThTzLHm5JgKzCrYSvI4H24682X4b5+JebDIE7G7kYR8s+iKNchAqmXJsOhHHoybg9luJGojZ6PYb0pWUYOIrU1wVe2Vv5/5FSqVxqTwPjjlMuebIXSCJnKmp/P54Y2NB8A6q8LzxKllhDNP49zMwksUMD2r+uzyMTsMZyEcndsODpsvDwprPFDuNHLewW8PO1x8wHmH0YBUK0YnHjbU0R6u8KdI1krdJjlK5wZNg/Drm4mG04A1sjx3wGa7EakvAGt97hgRPk7LAzimqcDkUU+DgvWxXaDA5O2Ovzve2IZtya3XaNKB6KHMY2ci05EFxX+VnbW2Xb0XwM/C4dcapOj/Zcb5CF4tqdWe8iJcmX1A2K4pj4cj9qu70VKzISjYnMvHtmKbIOawrFvbvIC26Pyd/wp6PK+RrgP4wFSsa3I3KIi/Zfo4AvxORqzrLC2jSxfGmH5GdBfGkHU+76Krc8cWfvXfF6Xyd7PKSiExiLUd/3HfGjpp31WXpl/79ck7e3p+mP+j6eP2jjRwFkIBLxRcVZdyDC7Y77Nu/cIaPqNjxzMufeKdqXz4jvGRyzVMV1H9dPzn6hLOX5X7t6/M/bVi8uif1Oj1TrF5S4WTbEkCo8vhHZ7CZF3+W8uIpArm8M1bgFY+DsMfKjmMdl1wKXZKKFbJwsCLLVWFq9Q99/D9IjaBQ46ssPIwpmVd4cKNh0cGbjpWVvAUgQdXLMDDVdCIa4Yd+jAs5bH5jM2+JvkiUFZ+qrtSJg0fiDS2BDN0VpcW1jsg8Fxqbb/G0IOpOKZ4lrtyvIku2oJD5KZ35HOChWFOLlfyUiE6cCjgcW9zlQ/jkwc6Kla0wtuVPSJRFxrR9uPF7TS+t7Xxh7ae89XMhsH3FwolVOA+HlptOPPj2h9a++9yUgp16ZLAdex8MkVaU78VxetyZ5XfYreATZZGVUBwswPOxIcZbRKK05CKIIenWxBtbBoTSeTBW6Iq/syMDuDPjjauNYZwf6kpLzhdxfyiQ1ywJwoZo9H+g8ODBSkXIsagy7fgIchHBXyy24USVGSv8CoofoHYzQmp/kFfgmLHNJDg40iqD9VCNa6A4EILJcAPyYqr6brY/QY1xSOVnzYsBN2UqCtjN4ya8MJv0Oh07YBx+ZzZavl4eqnyWyQnhP7sNcZyNLhyB+7AEvabTwDXC9cd2L8cdPAyewCzMwu54E49iDD7HAfjIFCQcWfKzY7HBmyILcG5C7NYU4gwkcS8Ow4n4brb4Gayuq8T1kCwZOWgURFSZ4uAnEGPoVuA7EqLKh3JZptcq/hxIzCWqTMFGWfPCAE8Vr/Ag3y24gNw64IHqjY9NNlc42Z4W4OrOWKF1FBaua5sHRy4X0XqFc5LmhL7RNTfPOtoOJ9qTEDmDEe6d8wqsHaRwsp1j18Mhem2qvMgqGQ8nO78FuI0KrOqKFfJ74Lob72Pdz87pirzEml173nhu7/9eeVojero5XiIRk+uV+yC/F55F88PJtsL3r5x76PZHnvnOB38+m8+Gt+bpTsyffy+0427/HnvVQ1Peu6p8Y945NXlrfngQHbbJuePPsFDtW9cjvxk/MTRq59/tUHredZ3lJlCNRY9vtkp+fcfPVfW7EDyfKi8cvD77IZxs5zP5bYUmu2JFtlReFN7Ytme6V1aLyN2d5QWMGLAiL9n+V4EwsO3qzliB33njudxuDCfbbgVkbipWyDHilwH3opO8woMzHRYdX/Zh4U2EDF5ij7poyUKBXqyCU7IcCF8Yi20x8+dXd9+wYVJQmFtdtPhcgVylikttnhbEsuj+RTnIeUlEHo41NJugGxsSZSWnszqEYnW8sYWVrC9WlEX2dBQvQOTNeMMgVQzb5CwoyPJnYbDX1MIx4QWH5H/zNw+91fv6e5+zwOBDwtsfZ9MsmJj/wEpy3x9PnVA2fqftdhy9Xe7d8YZm32wNvk5x3WtUZPRQ/ieJaISfzcmM+Y43BaftEomykrOh+lsV3FvR4F94GUWOuPfDRbeIc1YQ6TYZjVRr5mHsDqH3UIu9u2m7ZTsKzAra1uCpWsiJ2BlH4h/YCyfAMRHr1oKrH0/heiw1haY/qrEQaoqAMSYrZGgHUf4sVVuFEFRYHTyZ1SLmdV+PGlOA8BCm4oy3XRYM7Gaw2/GAIZ2KkVfPyr4nEkup0CAJkMUJvUxewXfwFHbEXCTwKrpNt4MFD9cyOx4kt/H38vXPRjWOw8s4EM/gBqw3fzc3dB52vGlT9eZ1VcnfakIljoXgODRgLd43B/tgS/qMFJmF+3qkMdvKlSGqzPfGzgj/ztnYATPwO3N7HYgqc0Pl4cVcGau806ASZRAzjrkKNeZAssEbebHIswXJbU3w1u8VTbtlu1WBKLihfbJLwrHQWsCZK4JvBKXN5q9su1RduRCK81LxQitHLuPVAVoL/L0zXmjtMOetWPN1CckTgDyZNb4imZcdFI7bNh8xXjnquKrjdzzt4n3WXfyN3/V2vMYxDEd23FN5yeH644H87dGn/Kxs9Le+G/rvouMP2+3ye/fuKs8j2dZb83wWpubssddvc8dHfrTdflPScOSbHy7/Kf85C3F28Fi49a3rcSteX/f+ZSev3bnyDw+su/hoFics9ll8DEJeov10Ef57um5DqNua9EuEk+3cR/kc3ZuKFVr5ZDvf8PoOI9LD1wDySipWYD3HiAz/w9jL13fGCmwFp3G5lVCOm7fiLVXgjK5YofWiv4XgnlHqFR78EknO4WFqdZvcArBSNDeVHx1RdErJuB14MC223Z4Jul3m5MiLAgzv7XUnL7jdLvHs6zYo6mJNLdZ8hyzxsgOQD+ONzRwhWVF3Ssl0cZXjkbeG9Qw7bO4dz/o+iBkp7qhXqURN93Tvf9btr25exbJLw8XDRb5TSKTrwpl7ytfGbP96RVNLrmZGKnxIaERFPgQrWG7ejxSPHX3ncXvv6kzcfeRzNr5GIhqZIcADCnymgvKgQi47XuJ8sltD7vSKVat9cxA81JWWnCaOLoOL5niTf+GVOLn4awjJg1CoCK60jWEIU8ipXgfIaNdxZwSokng40OGVN+LNSXrbAjwfD97Od8JJcDEO52Fp34x8MBZgLEJ4Ay4eD7QDz0hBeVv6CIJfG2ePIGTkuLyRfwbFn1BrccXMOG7yGfR8JQgSYrleeHCy2OMmLBiLm3EcDkUuqlBrWtYc97DjxWeLmw5n7W9jDO7AHMNrOQe15s8pu2ehzd/Hrh+LZ7or1qLKdD7KcDPuxqemZc2bJXkAvInyz7z1z+fyM+yIB3AqtkcKd+Gf5ndQNTSwUM4QPxlHT9msvwzWQ5U58Jk/RG5HOUKY4Zskm+nycK0/FkgOJsjpcc0e2YBaU/gFwTsI/W7j2wJ4gHnjCRLT7QUcK5Nb3h2Vu2HjE8IOreAMF/jGO+WFdOj1RUGi/XQVJFWca1Ll+dbRrnE7VXxXgae64oXWm/nuN60bm9uzqRWCj1LbDSCncqTP78Ib4XA9vTTsawe9suO8X+6VO2FiaVdsArsbXOssargO2UnjyOXYYV+b1LLjmZdDttt+vw+uPutfvf9tY1HirXlaIlw4Ylr5pdLzYcvIoxeMHrbXgUelYuN50ePaZbeaFya+7r51nVfz8lvrLvzmTun3OvlsmMtnthsyoOgNJzsPBwyZc724cniQ90lesuN7Ar0E0NYhR1v1HWuguikVK+TzaUW4vv2HUFykqnd3xYus8R/ZkdSlkjsce9S+flJXvJB7x5cFLydRr/Dgl8Kig7ci/1ncloFcBSPt+dMJ+3+64/CcRwOSSQ0S0RKG4ExWR48M4moYO3TRNwF9Ot7YGvgFJMqKn4dKnu7waVFFYo1VGUB5qzhpPkQhR/WIch/1iIdktORJhRaHQvL1eauaN9/IKFHlB8pux10skBLPv/Nw+aTwe3AwZX6DUZywi8MCh4UJ59p0TF36+2P3/e0tq9eVnz254OVNbcNmVj872NeDh76G8Iij0quiv4k3tFpvEeSfKLRWgWFU8QSNt4gVZROPEZV/CqStN+Qe4ufMunTOwTsOT3ffJ8Aokq/iTa3+83fTvSr+lkJuVTpuKhZWNLVY2dSjh+f859NNvfwut+3CQ8xhPwrH4nbcjWCn1ypjjNWDGnM4+6Mah0AN8XCNKT5qh3AlzXh7cO3wu6QPCDczf1QZvkxbP9kuD2JyDbj50tCKv2cairEI3bjUWHk19HEfeBvm6+YGzUNpJYqwGEX4CfbHNVhq5r3cZHmT40bPYoadLN7qlmMcBEdjLww3nibceKdlfy8PYXYxWDiRj8L3cQemmAJiAQ7AP7HCpIfyc2DXlc9RBhn1EA8Lclpmo9Zs+v4g6XY9GDr5OA814+Lqx8PIyGapcHgZNeYWbMcchDDGdAVeRI0ZjdrBTteSvr+PB1Jgwb+VQEm456jKzpevZNZDONnG51cB4b5ydBDxM3xD5xSk3Ueh2pSKF/leoIis2ylVe+25rntEkM24IacC4zQdOrBrfri/RxK7srxcsWBnGvB/won26Rue/sefu199qumzfye4Zrg2ecDzNbMIZ0FbHE60f/LuZSf+fodTzv9gw2NN/17/aAPTbr9Y8xnu3dyxVz64b09766RPbl28unddGzuE5HOwO8tzisZ25HeZdb3rBbcsHr7f4TmpWAGfPxb6lFTzIs5uRR+vsWB5e56by2BCGQO4p6ViRXb+R6KNRoLLAHknlKNTgiLuw8mO5yG6x7gN7xY8W33IoDPEQ9aRlgnPTw1lUDbymxWvff6vur0hTg/U/aoMxNiMKPMKD7afWHSwJRp4UA0BtqoM5+CaE/Z/8/t3vhxomJKMltQrNCqiC2MNrYEuf4lo5G1KrSoaWriRWpGIFt+ukKMhvZGKhpe9sc8gLJo1K2f8Lu+/CNX9Qo4za96t9pC4urLiBlEpdVW+Mb+pmYQpK0xnwJHHu9Purts5OTPKm170GOK8FTJsykOoLlpyLuCepyqOK73TFzS+POiGlDU9ewjQnRTy14rGFuuhkx1Z8X1sclW/M7/JHpBH1EUnTnYQelBVe3ohUxc0NfsSixOlkXsgJAvr4z4E0T6wK5MhWEkbVK+PN9mTeW+ZM3HU4sc6Pngm9QnNlrixs+27rSFjmZ5jdBF8VoLJ15mI+QORg0JcZ1JKB2Mhds8qPbjZ/mtIV1JKR9UoWLjptgTanFeD7rlDe3V8DxPQjZeRxp1YPsAynJsuFVpUufWYcDYHr0JxH2oHOJ32X8vsYJyDSnyADizBa3gSb/kqfegDwBEjOwIO5uJ0DEMtcvEcag1vg7dEbtZftJxZoLFQYsouy4WaIQy5qkzxz04kRzc/wFIzzhyIalRAwTFkF3oxHSv85+99YPAdOzM1RrFnxyLkoAvvo8YUUMSQ3YStBBrSccRL7ESZq+11ZFv8PJwmAloVpKLIq+8qFE23Ai5v5r5dU8IYicG9DSIfhnr1iGDZbgcLhlkimNpZXuA3VuY65L7RPq6+Y2ZI9QGFLuuKFfGi51vM5NW1nywOVqS7178SGr79f1LlhSyKv1jzGUi49vUEhg1n/szirlgBu7v9926uZY8OMJzyYogc0oth4XXl47hWPaNF7hkDyOd5yfYHRbC3Ar/uKi/0SL6DkF/XMUsdvR+qH6dzcMTaMwPkxfXt9xrn5O5N+6Uq9x5k2ukh6xXCAM83defQwYGW8fUd//j0H9ed8Mkt5k70Vcpp+Qyf4hUebPnzIac8ydpG2wJQyeK9cbJ8rRVasrT4fDhysapeEZSrQiTLIqyi9/l4w8b87wfwP7IGZT9wBN8KygohsvLWGao6t6Kp1VcySmS5Ej8QdatjTautjGuC1umj0s7jys6P6IIgD5IV0eLvOJDraPUswAyrV0Y0wnEE5VOPBh365LTkIucRZfdGcGl5g922nFg5Z+Je6V6H6YdjBe6RscbVg2+Gmb+fyowSqK6JN7ZaCVB0UHXS7r8AXaMw9uqBB2oyWrLmT0+u2em51CfMauGNg+TNbQ2ZdNqQ8eAgqcru7FuFpRDMh4vJqA0YV1biXjPkEDw3pCtp5jBjh4Lt5fdQY1q7/qgyxcwB+BC7I8Acz0TXZy4Hr6HGjBo8cNTFzggvIDTlYjgbVWkMc9ucz9QfudgZN2A25uB9PIQHDM9p847gQGRktnxfb2I4DsG1/YoNDwsRhmvUJixMfxuYa0NUGQY+FTvjs5kpg8dhC3AkQsb0jOuNxmSDCaz9UY3noFsQfEfQTMxFD5aZDhNB/oF/8bl1wbGXp15gkeRbeGU5CFcCooL0Lztj4+3Gb/drTri9g92AjUHBa1krdn6nI1R0ZpBsNz/Zvlxh1HWnDeUMWpBo/5orYAzGQ52xAiufLz/ZcahCHwTk3yr4uKu8gLykL9Z8FuH69l9CGbrm3pyKFVnjN4hwfXsdFGfkpN0pbfPHB17aw8n2FYAcKaqrOuN2Iu+4G9oOCKWFn80OUD0mFS9iN8YX4fp2OiefgVB6WurMCVbb9rybunZ1enpbeD64Pb2T31mw56BLrodwsp3csRPfX3zG8o2rH+Zo7qssPHgmzvEKD374LDrYnvVnyW8Z2F70tNrWNl4yWlyqIjfBxa3xphb/DIYszMFHyZ+rE+O3tVo3isTJkSqmKKrqxRVN/umpHupKIzUimAvBj+INLdbZen00Ek+TiyH4Y0VDC5nUgci6mB7kQK4ob2y2RmJnOwNs130MkQX9DLUGIBmNkHzFW/eb8caWb/X9wWZYevDBucOLutmC3l2gK4P8R4hk6X67qORyYedD9CxbgZQt5Nh2XL+pZ9gsm1fHjWWRPXvUWHzTjn5tvLGZ6gYrsq60RfMbW+52M5kWfOh5Q9zWwDEQH3renvjg+c/tF+C7cHAtHJyNJVa1A4uOZRBjKvemr8pic1Tjb0aRwS7Bh5htjaTPBKmRSFyCWkth5CHjtimoMYd0f/AWx/fITWYjqgzJfBfUmMuEHRlOxbNIowXL+2zD7ci4s/L2ys7HYdbDP5OKS3MoOqhau3wGVWYExHk+D1FyNgaPAs/GnkibvW0HwxPx8wjpj0rcDcER6EV4C7oivJl/HTVGntp3E852eLY1cMTkXaA4ohhEus04jbpPKtBFAuRQMfPh+o7noFoIOPumYvks6gZhbP0bu+diGEdgu9KnKRUv8t1ziPz6tp+ryiVwnItT8/IDfYfylnZtjxG9b4liXSpWaE07zluRKkCo90EReYqvNVVeOBUiHB98seYzBdd3aRwp0Ec6Y4WBCePh5JpfAM7lEC1PlRexW2hFXrLtUlE5CyJPBFnG00wMMK7Zuwnk+52xAuskIFMgMafJiafi+YEy8Lxk23MCOcBVnfpOvMiLNRmE/GR7oypOoht1Z6yAzx/J419l4cEu5Kle4cGNgEXHl9We89bkzbN4kx10k1leOvHAkDgMIHq6YgiL8xWlkUtCQoKLnm6LgieWnTzx0BzHeVyAZMySnuqhrqz4fFG5VKFXVQQc0P1ScRvijS00jgpEIlqyTKDHqOhf4w2t1mrWdBrSzkMK6Xbg/j7W2Dr4Zsaipyzyc5euoMBH6d7umT5k1j7QFVQFEVE8OJRtOYe1yWgxs132heCyeIN/Xk6irITBYzFAt3MFs2z27jedfvCumzZ1/1sUXRAdHWtsJQl2c6Z5H7IdnONVQsUVDS+wmOP3xc4YO2TbGjjTZyeIBwg3qT7DpT5kxgHcUGt9fSI8MEFVUQHBOxiOI4dMZq3E741tN8PPXMzCssG5RwZVZmxwvglTqzVkXTuqjOx1PwzHeN8ug4cq468yAznYD9eZEY8/zsUO2GRIfvx89hky12Q+RiPHjHLHI4TpuN4oaAajEjcZuXCGIGsfLRELUYq0Kfa4b3UZeuvmWAQHKTwPx6ghTreqgTyQagvE0YsZWDFEgeKF5AmmYKmxIvBa/N7euq2BRFrP9p/dr/4jBEy8ZfWwjzaOfpbJvAK51iKz7EM42UG/iKPSaf16kNtoXqLtQUdkH3X1ylRFkfVSFk62nQIIORJ1qVhh8Hdvft5wQHZMvf1mERbN9vfUWXR/TnjC1x4gj82Fe2RIZVpHvHBQwdvHf1B9LVVUOBmzxf/3mUO/bQ7g/A3Q36TK7c6tRDjZGQPc39GOfKcRn0xZfepEa0HKXBWTngv5U1eswBrDkLeyvUJcWabq/qorXkRSthX5yfbbFDjRERy/mUHYAHjdk37qFZ4lFEHw9X5Vlum8JNGa3oAPF28rvI35bwZbBrbLSRQkBrUaOddfn3Z4I9ukH3y6f8UDduJnsjRykorZSH8db2yxWtNm80peVcWzFUPIRldES05xoKwgGUVvbXMzHM3J0eccoCXW2DLkLa4uWvxrgZQr8FCQHXzWbfUBAUa6gtttXZT6aPE8F8Jbhoo602NNL1pvsYnSkj9B9FhAXw0ahXhIRIupx57ChM54U4vvgl0RjVSHgIuVHRTFLNsY6JY5E4et73X+rQ4+EEVJDmTGmY3N/gek+Zwi14jxMZHSeGMzGdLsNnF8tK0WHuxM8ebNDYj8g8Ez8Up8CDEZLOxM+SMTukZi5ScYhhn48xc21b7I3OApwx0LF7OxrC94cSAWoAqOOXQv2ALbcN4wS+HgICwJ5Kn8xahXMkZmgXwmM4pwsZfhtSzzj1cfgCpD9COxdg5qjbpmMCpxFQRloGy9dohk2AU4GI4ZMd0FRQi1RiE1GNVogmIWBD8bUj1UiQsg+A0EC7B0iFj7TEAfW+0/RK0hxLKD4F0QttXCoz/HgxyJAXuwufFCpgH6x1Ss0Jr9RGS9JapDjh7dPq+I0mRfhJNtK6EyU6E3d8WLrArHcF3nFFp3C/CvzlihdWTiIZxYcz/Emazp0P6bEU8HIEOQFfIuToLqCX6jCypNFPqQqPu+25s+LGgUkVfXtZ84PS+KSkNnvDBQ5ZTlavAC+7G4MqWzosDKO8xLtN0ggmkQaUyVF1odeQvr26al1SgM61PxQus5RoTr26+G6nfFceZ3zivIxD34ID/Rfq06slCAczrLC7wxvbdWvsrCg2Tc07yHgzchFh2c+foeMlsI3lq9VhuVHgNa89kW+75OSA4sX9Vs3ahuiJbk90JfV8EdNk8JD4lohAtkY7yxxa4iMB2EksNcVb7P/wRF0bM40M/1FReS/nTD+n2DOCUEfUWgcpEj+nqssdWPVNcHEl8hMl5UXog1NvvmBiSjE2dDHfIAQqKYXd7UYmXx0/RMoOco5H1npMwoX9k8qG3aH4locS1TZAG9M97Y6ns7T54SMTJPtiwUiAXKdo05nG4UyIkuZGZFY7O1aE2WRX6kiitF5cJYU7NXyXuWvBzJcTS3rYGqjP6k44GHSZUZazAkzL72Mp4e3HjojDkNS41njh0LcIopJuhM6pouBrsPg3E2piNtujHMKgnscqEaV0BxPhycjiWmAPFHJm32arj4CZb15Xn4o6rPg2U6agwXIxgZ6/Zj6JCIZZYDvRI/gBg/DT7TMwM7KDT/yshmXzY8jOGY7dtFyrx3Frd/RI3d4trgC6+OK1EDq0mTQWZkxNv2Tf3kuP8XCg9PTpsh+fZDfrLjClX3HEAWp+KFNJezIj/R9lMV+Y1CftgV4KKZX99xparSJ+mBoKyU8A2d+Ui7LQJ0dsYKB+Sj+CGcbKsH5AxJp4/onD/Bj3hqEE52/BHq7gUREjqv7IoVekVXH8bWr5mQo8YnZBfAmZ6K5dvPQNM92fNdgbR0xgppfmdF5veGnjDCAFe/1VURUJwl2n8HR08RFUbcW4uZzO90WhV4pCtWGGi0mZdcs0Ag14nit50BXZGMkZl7ucK5aLMuCy/RvKjzOfyqVC2MbDjd20h5E2HRwdGHzXNhS8A5veeD4c3ODBKlkb9lkh/d6UFul0urDs4d/l43b81t8caWAYE/myMRLabH/Nc+2bBhz+/f9Ya1dZycc2BY0y5vee3xxhbrHJCoi0aeFWBvVzDJNl7wUF8ameOK2UT/O6xXj5gbYAefiEZ4Mz0CinXxphbf23H9nJIJblqfgCBXXTknKMxtxcnFZ4bE+YOKuiqhaRUNL1graaKutHixiNDU5inb6Ch58oGHqpMm+eq/Avw61thi5StkSKeyHVSnQ+QcG0+FSERLvg1ok0KXVDS29jfU4uFGnT27COwmbGvg8+AdqgOLoy/m+vYR0QJMgGPGmDtAUWotIjx8Ed3+fmDi6nnYCevRYULilhofDTsyKg7e8n+NGqPL90emkKGCZClqhxhvcAwk+J4ZxdWa1mkwMj/PkRoPdP/OTDVOgWIFFB8ghKlWG3gPVcYgjRvifsjBbN+RUMb/43dQ/M13BNMf87EvckxRSDOxQI5SVmLLZ/1V1Jg14uH/QuHB4pLdmQG32EzrHkug7rWp+PhAYnh+Yk2ZOs4qqEmltZIvGTEP6M8V8nIqVhBogcDoeFWMdnrlgM4FBYFqoPxkxyImwzqiCzrK/TQmUgAAIABJREFUB9l89yEv0fZTESmF6ucCPOp3+I6ve3u7Hgk9CUf2hLoVQcodIlzf/iZUelKxgkB1JVQlXN/BYma8ABd1xgqs5Ny8RPtPRHCeAm92BRQzY+vXjszRnrcYZJeKFdJ3y4r8+rcPUw09DpEbUuUF1oIvb0X76U4O9xlZ2llesHnKNM8JXlTY8SXJ+6sAuy5zvcKDmx1vd7yxD317saP/qIUVkrmxJMoil0FxoYhWDCWbrSuNrBbBDvHGFpLqrMiODL7thtxJQQFxRCIa4Txv+PYhd79TV622Ms2z/IOTHXWm95PB+sIQRNXEcn8motNiDa1Wx9dktPhSiJyuCtcN5cycv+p57zPqA7kX9dEIFTH5Krg6KMwtGT1wtov0vwXiuIpZ8wO6IkSWL/I9Kk7WlLTOWLSoT+7Vh2yX6UFR9KiDm+INLZTS+SJRGvmzihQKNF9FkhUNzV/4LmyGxMkRtsPZCflnvLFlcw8MVtfc5LbVwoNdQK8Qpz/NBPO/qGDJcFNIjvRnspNX8A6egho57E9R29fe9kdGxeF1V5agxtgV+6OqT21CNr4d1eAaZUv2RtQaC39/ZP5uymZpehZsRV6J+RBjXrZ4SNInUY0fQcEU45WoNVlGg3E2piBt9p2NWVfYYC8hknQdfM2QaR18w/fnq3EU1BBE78fSACM3IhM8x8/0pSFD/4j/x955gLdVXv//e65sZ0DYI7FsOYMQIJbDhhBow56hsUxSRmLJCZaBQoECBX6lNFD2bKEULCexrsNqgmUCpbSUsmeZsRz2iGXLCXuTZd3zf84rXaHY971KIYD7rz7Pcx9J98qydMd7z3vG96TVXovR2C9B97/B8BBPjoRQZByUcLgtaPU4iG9P1uq9EkLp3GW7GMWGaBotTgYrHCcwgrelexqs1DwQvcerVk7saRjnKMwolEYTjxF4T8Og3btqffowoCoJXXaCAaMFBq5M1vpEPdSRsgVdJ3BKlJj5KQJJtY2jSJw32vlXCdcQrMu6gxXacUzwmgkZx0Yng768YoelZuI2kpAVcYtbF9sys2sGgyWB8+O1a3onvV8/Wjt59ZpdrwM8JBn0+bIrHUh3BF7zNsh4IVlbrk0/sDvyEuPubmcRNwndSz7UhjQ85P5/gm14SGmbXHDftaOi1FSLwIog5YdW8zH+aWThTiZcrctpsInW+KXUbd8i0Di3XAGz2i/S3r8GWdNDrUu1M22hOeCXpNPxbHmq6u5+WYmbOdFcU3kVMZ0Oi0Khu9v7SzbnYFZP2B6UepJBmzPz4XVtHVoXWrTGH5aBl5iHGeCfzGxb6uhqNwP+21g8IsR3uSWnSv6JxyODNHsM0Cm1Ll4RIS1dTr8n4o/Jop/UtrXbxyfLwmnTPF+nXn8UxJsw8+N9vBLrEA34fw/QJAavNJiXBts6tFLT847epdRT1PsKmF8PtXU4SQcrSd5MErIkIw805Dvb4SM5bjtn8i+k2kd0JbSzGISVJoaU497k2BG1L2FV5STJq3e7yneHVQLjpojAdfDJdHoVo+jFvDfTtFbFSkSypaDO1OOn6kYus6CIan7nTj2kmaAYaaJX4jSwiQJIOXqVV2grMKagSXky9ITxO9VBVnrbyP51EghLe5rkeHUhooTOtMnOirCqrEkhonpNuVOPf4GwK9ZgBKL9tCLkRm57XgdqjodMKORGmK0k85qJL5RHIE9excjmd4evNYreAPhFt26vpbcmJ1HKegywviLLmOSmzOk1u1oAPoEZh/eEfPpGilI225zYwzLoaTAvSoZ8Wq+U11y2P+D5JwPziXisTijLG01I758pBL69O1ihv+aUgZBoZeBwwtCx3cGtXL1x3mjnZdKnBuDHksEKbdVmaXPnwTDofgJ9jd61++W0o++H1+x8ggB/kWWNW1Y3ylWYzmt2LQOsVclghfZ6Ll2QHEeW9QKYX0mGfLrIgpwP4qVNeaOds0AUTQZ964TnvgUyLs6wLw6ZMYvRIW4eMUK+LblVLZSp4BAPxuJgvlyNmqqbRaSG2DpIpykhNAf84qZZwODf18U69K7j9E1S4rXVBvHeta0dWn0Ss2bCDGZrHoGvCcY6ROZZy62Hb7fJ2sGDxYXlJcYvQm1xbcKOeUzlUWyRGAZEBo4J3hV3dLWbgapLmXmmuM5Dsbh2ZqqScy16HExbcrrEV+sVEaTxHpjmEfC1RfhpXWvcUWrarPEv5HSr5Td1ku2CytMAzSTmVxjcG4p1aFtip6tn/AnJAQnFOnS1/fYgKAl5tvDSQEIqVuzy8kcRVn0cxMi8ERGlPOuMVLBI7gqh1bVXi41UcaTL2R9Fk4rBO5PWABFjaCvX/IcQNkOJyj/4ChFVyaEnXekyDoMwyrXSZRZGq1AEoQONyhPkzok4GIbq7PscIpoyW/EK9SijYywYp6FJDUp60t4WMTzESJ2FRtX3oT/pkuFhsFCFud+oRjqSTngdh1KUKi1XN9Ll0JIovKdGq0XOYTv5eKAaHnbHUanOyq9PYrOQPaUru7oJ9H4yWK4NV6scBBhS5bUFM45yMya8ZuK3AF8AotOTtT59I0X5ovOT5eRJvcKEl3pqfXKvciTd4t561EgrZB4J0H7dwfJ+hkJpS9eFJFWDzI+7GTGC10xIov8ZRNaU7tqRrvpQZQu6wxZbFxPzO65Cas1dfsuwxJgYYhFNWe5WbWImJE0hgJSxR7KuzOm8y5L2ytDozYZ8Xqarnhnd+PamqwcXvwLw2iGfrRn31i/H9s+NSpOREyDLa6pcWzMZ9LlWja4HUvY70744ZLYlRodYsa5u+zzIiawO8pw58Ixqr3qP1c3Muf+HTXOg6gwCX2ExXTCrrV3bIbKlunJHi2gJQK3roRUhZWBnM+NYN9nuBcdU7mNZJMJb61U221ztl8G/yiBcFXS58WdCDI8x41Mm+t2sWLvj7Lilxl9vMV0K5tdCbXHtBSWo5FTQTiBqC7W2a70iglnjP4gtdaNaI0mqusqUaE3VHxnWQcT4eKhnx8nTFy1yFJ9qrq6UQf9CAomKaXmoNe4qNW0G/HEmbLV6TckYnf5HxugQ42OgGh4ywKYvdMJ9mRn/I2hcR8VzXRrwc1VaKyHLfHLcQlh1J5YQlLR5d/YKCHaJZwqTMC9PybtocIj+hweVrrkSDbgVjJ/nrXRJC5mJV4BRiu0wZ101xn6cqEIg4ilKoAi7a1Vcw+rmIOe85H64akWgAQeDcW9G3OwCbegqjIfAmAQDe+ZN5E3rn1SDUInGbHNLZ+pVp1upuBGDxy5H7ct/g+Eh45D04pH8tb6hIi3eaOINGFSSrC0XLRtHdmvk4hWDE5J3VwHwr9xa3EvpKpjvZMZNyZBPb8Srz32+eMXgrTsB+jQZ9EnPK0dUDoS1+jE2jCdlUsiGsV/PTG+/nEVvSyIEpqsBfidZW743iLQeMW9LQho5imfk7Hx6JiNaEocarEITH3GJZ++e45wrbUobX9+KBg15CiT5YXyW234qjXZeSURnM1LH9wRHaSUlBK/ZuRCgKUxF43pqS7Vdy70tXS8zW6Msq2TCiroR2ihAJufzCZCBMnPZ4u5ad12T9URycoK24SEeBjE6xCWl7ZeyHtiS6WzW+N9gRnEoFnc9uVVvD6I2ZrTUuTR+a5yy29BBxWvks8WQcZ1xmTWVs5hJBurfhWJxbXa2Sjq1rKVg9Zky43QlGvDLYCfx4tvcGt9JiW8vitLhEKabtS3up1YeAoNkME0aTHs7hUFsojX+68DqBvW0m1dEyBg9chwHMWFqnUbF1az2n2sRwgRKpXo9k2ff85JjmWfmGMmsfB4Y+6VSa/Z30xUxA/5HmHgXNnhcngZ1sg8l2TAbbx5giEx2+oY8Bl/jQLyJiHLxOxPGriDpw4A3MAi7OlZZ5BJWLaclufZdvIH98Yjmhm63Y2fM1t5wbdJJl5K8vA8iypvgTFh11/w9DIRwSx5PQ4PSKRkPA1W4Jd2LSUtYiQi+rETmi7Eb/qzpV1KPK1SHXRmI3Lu9ymeKy1h6sHwB6eipM1LSxtksMI5Yj5CNhL/OB+NYNLlU+gjpbrfirbzeVeLeiy2RzCbXD1SPhxJwykiEuzbQtPGaypgY00vFFe/VDtdWznnNrlYQTyTwDd21Fc5JxOuGTO5Lhnx98776URpNiNd8s+Gryke+0EBaT583mriHiVcQjEOZ+byekK9fyLw8mviJlQ4Xvse0du+e2jHaG3RpS+e+xPSITCSSIZ/0HtIyomXZjh4YT0uCLBvWfj0zR/YzeGy80a4HQbxDPp2UMnPZiQzjFgO4qCvoc63IyoR3zjMsBLrqfNpKRNlHIByZ7zsKw6acfOIX997cBBJlJt5Q57MY7aENbXiINazKZM0a/yfvfrTlNnMeecR5MFXvmbALsyUn9ROhWLtr1nNztf81qaKoi7VrLW7BnDZ+T04ZT0lJaKjNXUwsGvCLS3Ywb/LFdm7N5IRooOoygCXx6p9uGiCCGfCL16icmW/XNVSTPBEm698MFBextY8u90OIVvvFbX8BCK+FWt21Sm4L7FKxFr3iwRnmFgqKVlfVgliSO4cQGT8Nti7pn6An33Pq+D3ZMB5mxi1EOKaYsP8JLtU+maTfo0DGbqHWJTK4aQnstO0HsVfek4RkGcwkMW+gIWWy6fDUTvgKr7h8x1OwMXqVmNZQGNgt7w26HhJak2S2DzIJlc5Gp3SxtdCmZtv5btCiwZGezc5Ao/ImONOAw8C4H4Rr0KiMHz1pr8D0zHfUVqMp5qAEPRBDfquMx8HZixBW5b9iSP09b7fXs7ERPlfhXzFMJbfE8XpCWIW+JCH3LESU2qKeBswAK/XO37tW+gizsQU8qmLmAVePlBBCEtFs+GJDDdQbGunfJJVQEkLUxfazeFu67gPz/pzyjHPVyogmrgeJQcOL3CpdKhYsG9FrGa8w8zs9oQrpDeZKWUvXI8zWrkUGj+ucOXJd8b4cvC2Jm8G8hVSRSJNKJ/GtMrPLy2y9AKKt8914MxUk8v+eSAbLXT2XW9+0dONBG20slTFeJiOcnFmmNWS90UQzCAeAEXPz9JRGOycRkZSLm8lad60OlUhrsbS2uCBZ69Pmk5VGl11tkHE6DDque2a5a26kJByvTXQ89P5vD5Pq1H6l198BmTjV2ReHCAXJDU1u/tr8ivVAmsK9KR86/2f+qrrFcW1SUbrbrLUUoI/zaXBEq/0PkoE9YK0dHWx7zVGSV7j1hO026V05RJJSnw3F4q7Z+WpWDuzh8VgTZi5aKgaIFlO0OkAiqNWe73Ojgco7lEAX0T2h1naZzfZDCW9ZxkvE2M5i+lldW7vEwh1pqZlwqCVNlRg9BtNEN6+I8gqVrHlCHOIMvrROo4oq4aWU5IoAvQYZR9e2LnGcHar+L1T0sGWhjQiiF7K/m1aHytNhDnvAR8+MdUgHUy1mwP/U/W99WHVn+3LRexmohod469LnRgmuwRqXm3S6V8o+Ga0Ox7BWlnocBFL5D5/Cwn6YqwyW/kiDOEttuxcRNUvVE1a5JFI6eimaoPXyYRZKUaQMAlEFdRecC6swmHhbJJFW6w7O0oDnYWE8SPVBca72SXsP5OYnuR+uysWKetwNgrjX5cYvHXb7cyImw1Dj1s2u6rFCujOwnMN/QUTpFLiTriBajohqoKknjA6swSaIKq+vMFAND3uSKZMjbYKokLlJziSiA7try7UheG9L4iwwS3Lmo8lghet56m3pehPMg4d8tno7l9wCheQ2kGo9T7t3B8u1VYPeaEImZQdJQzUQvZUM+qRrbT+8ZpcYGpVg60Q3yXah1Ey8awBfdQd9eb1C3mjnvTBIzo9r3cIxGYlzme0/7qbV4butc3Sql+LSlDMZrHCUXrDx3b58fGrtWrnW7tBV7gjl0cRxFqGFmC9zKivOJdNM7tHenrdWvXf+AZKAvCEND5GfkO7Eig1leNgzRCnXlKoWLdEav8yMSsljVAYXLdHGodP6FzTbSPVOql38it51nH5vAoRPQ63xquxKBzIhkxDBOtAtkVWQNvMANzPh3dTaNZNcQwzV/mtZWf140M0rYtZU3cvM+zHzr+raOrSu87lHj9/OU2Q8T4SilGVNmu3iFRGiNf6/qRJDRiTU5lwOKwYfk8oR2IgZZ4Xa2h01/q+bNnHI5qkvHzYA8cqEDKITalvbJSzkSHOgcg6BfmcBJ81y0f8QmgP+NgIOPfcfr//+va/WSGWL5ICIATLQqMiU0QoymDnn9KTLa0NgHI8m1SFVz2xUokh5DoaCVBt1vRchrErTJbzjmiOlPBhinMjNtNGlbFYIK+l16aKqTRBUhFUNv4TXrsvraRHCKun2ABD2R6MmQb1BJZHKIPkh1mAXRJ17OWUJK7nmQ0F4Uvu7QhiOErwFwhNoVPtBT7rbrnjhOtbL6BFjQvI28lUQ1WOxmsU+iQoszQooDlTDQ8ZQ8XRI+FWrAeONJkS99XyAQ645CGbi5wQV1l6aDJa7hsDLzMSjDOzWS5b/vdqRWgFJwduy7DqwcSYxHdMd0s/OvWZnECBJUn2amDw6JdFSc9l8gjEFjCuSIb1xIHjNhEwidkgGfXk7ZpeZCemnNRWEu5K1eg9GJlfkYlGYTgYrtFVm4xdyyScrE50G6KN8Rs92N7w5aOWmg8Qr0+5WZSSJrGzwiwDdnQyWu+YxbtuyYpsia83z0o38qyf+csynTefYCdwb6nxWOUYb2vCwY+KuhofqDEs4kJkmuc2gzZqq05n5ehD9ItTafnN2gwPRgF927LahWLtrU6tooPIsgC4H4UxdnxKbaGD8JICkr8lyw2PtU7toqTYemPlcsfqfCsXiWpesWV15NRPVgen6UFu71i0mmAH/EgZ2ZKaj3bwiQk7+yaJQLK69AGTfs4rX0x/qWrMKov2IBvyLpfESy4AKvjwU63BWm1Tfc0IDw7qFwRetR6WReGFOscg4YlbrEjlW8rnSL0L6Rgw0ssnSmRBGfyOxHvWZkMkliKjyYD2/wJZYq4y+MlfZcCGsOrx6EFFeRD0N2AmsJNWlbNb9ZhpW7vXyTDMzPXauihgzjXlky4V0OEYGtKMRgbOnK6x0AKTSZlt4sAduztPBVrwtktNCeAYR1GTX9yUMmWx8hka4q12mRb8kQdZCBKOz63Wky5t3QQqjMM+lvX29UkOVvkaHYq7SIrETqTfUQL2hES+03NAk18OxJNq7IHEyLEjn7N+6KZhmciBkfEz0UvGe79UO13pjvdFOE0QzZcLVE6rQG9vqZt55OoOuZ8s6t6dupHaM8rZ0HwBY95OFBUw8OhmscAzXp5U5+SwwbnULbwjpDrI4gXt7q3pmj3Y9RzMCZRJWejoZ9GnP0dKWzinE9BcwL09ZJXuvmDWin46TjddMLGHCtsZgGtU9vXydPjp98ZqJtwBKJYPl2oiBNNGjwWvfBRnLk7Xl+vy0DF4zIbmJVQyq7wn6xBbIVqlmHr8rYqSeaH+YaNfLQRPdAff+DO6Ip0Fm5VrDozngl1lMyMOYWetSbZLp4PqwiBWFWuPOwkMZojVV9xLz5N7N1pTOnq/3SDRPrZxMBj0E5sZQW4drslB0auUYGPQsAYMsy9qv7u6l2jKmTInvLQAtCcXatdasGag6RUIgzFhU1xZ3VVJUuRJEB8PCGaG2uC6LXpGp4JmZkUIXeWhHMjd9cV3e6da23gz4JUY+QsTMDMLi2lZ9t9+Wn40/1PIYfwNRJNTa7rpPm2v8vyLGtUQ4LdgaF7l0qXEXj4vk10jfiIFGbnm4lBmvO/M6CXvCUsmkC9EEUYV1J1266gfhZDQqIR1n0jc9PyJ5Ovam80pEtl323zjXEtt0r5YpKML2jiqfNmnj6E0Q3kGjKid2J90k7SQQZqNRHUtnGvAvsIptT0ZTnsq5sAqpiAH7smsPnHo8C8JIlGIEHETx1kHea2AHFbZxq/QR0vvqZ5lcHX21TzpkJp4eyRURMTVRArVzxTbUQL2hkfwsEcKTcbjf9Vp2a9fhnOK/iv5KstanDVuNuK2nwujtFYmCIQTaxzUUYiYkkfliSlkndc8a6VjdZ1MaTRxNhLsJ9KfuYD8lzSxlt3WN5bXW40y4R4S6emnN5Pdqt+tn+HijndNh0Dy28ERPyHd4doMD3pbEmWBpGZCqS9aN0iqiCqUtCek3cgsYy4Z8tnovXdiodMGyXckynpTSVbJ6J3XXjdGmH3hbuv4K5gPJIH/3zHLX8L/X7HoSzDtsNrR8xNLp5Fg2K3ijnZLTUjHEs9Hot2ZsqS+XV+9NNMPA4cR8fXewQu4pUrZueyWVLlfm+XdB9efa0IbHLmrmJWI86aZa65DxClxMBl8avKtDOztsnrrzZmSkZHB8IhSLu54sUg4qTXDY4IPq7urQJsbO/1lluVFEr8LCMzrJchvJlRhctOZFJowjGAcEY0u0XqDmYyonk0Wyz14xNqK9dP1SmqsrDzaI/sqMx/P9fzNQOccCSYnxlaFYx+XZDQ5EqyvPJhjnMlmPumlwRKsrfwkyLgD4AbeqGNHqAGM6M30Ag98Mtca1zYqiNRPGQ5K1gH84qJKug2iawCLpVXNDsLXdTj6TsJTMvAaq4ZHbe0iO2TfNpUIYjBJVwdXjWuliE1ZGi1xfv0FEJYE6E1Y375+DsAsalYdAjzRpYzV7r0JEfRdn0rkav4UH1bgZ2ox3hahyStjrDYzSVtnYNOACpUoKXOCqtNqACBi1MFDr2itGqMd0kGq8tjSTK+JsTKW9LFNRhLGuhpSQLtuVxnOT0JSnJUQ9blBy8CkEMM9lX6UrbWSsexwR2D0zRK3ZvgENVMNDqoy2VRL6ctxyKG1+dwcyPC8x4/6ekE/v6VJy4N0vAzyeDT68x6VBXGlz5xQyaDFgXZ8MjnTMvbCpaFm2Yy8bLwF0r1tIQGTO1xgeqXKKE2EqgSY7GT4joj27kZF6hth6u9iydl5WN0pbQJBO5jQeBdGNydoyV6/IN4mf9JFh8d5OnW6FbVve2qaIB4mX0cuwDusJVkibBUdKW7r+SODTDKQO76od5ZhzZ+M1E3LuB9gqquqpK3XUZhJKza7bCfxzi3nP5aEK50aTGbxmQsaIE8FYnFPBI5NB24MnHkv38WD9kLB02L44ZIfIoLju4PqfIwk2YgX3Mzyaa6qmEHMrwLeGYh35qk06Cfg8GIu7uk+bA1WnEPgmMJ8eautwzWQ3A1XLGFgTirXnVSdsDvgfISXURDPcepBkKlPk937mQe+eM2OvOmZdN0/deSSMVDsBy4d6LP/0RUu1FmpLwH+8pdxRfEco1qEXkxJjqroqaBDfCPDzoViHo5tRaK7xH0FAKzNerIvFte74luoJAYusPxMp/ZE1bgaKSKyvBcts8LW6PB18o8dUHQiLRUnw/rpYPDeuLHXhIlMvg7VkTw80cnUZpNz6GxG6sEpQHAsPtsPNqruungb8QfU1YVyFJugNyXpVuSSu+xMQUfkVesJKL+AoWJiEuS4dpeuVTkUMhIvRCNekskyexkSkMB7zlJqpngbMVn1d0s3XtN6zjNKr/OaLtH1abL5JEn0Vg7C3VtBM1EuhhMSO0YqI2ZyES2FB3Oz1eQXKwvi15AAA2W6zzoTVTFBmroRINplUkMHZvrYHquEh56r0RZLE9+yYmckXWEGMeHdIL9AleM3OewHan0AndQfLtZ67sua3x7JRHM8YMtrws5CuIlnTzczxnlCF6/8vNRMxkv3MPJVBRzuJlPlu69w81Usy5m7CMPZIBsu0Hb7xMBeVJhIfgYynemrLXSe6pXcky2l173OAVMbwT3tqK7StNSRXhGRSwHRKd0jfGTaT//EnNnBez0yfVsdKKDW7riDwOQZwfFe6db0jZS1dv2bmSyBVNrVlrt6bsmhnmEVFmowlyWC52AE24uWwjY11eq99B1RH4w1teEjSksSG1zE8mqf5/ZRScWjpDOt6YDON30aGYnGxyrW0TBu/r5UyHmFQY12s3VUdMhqokrjV+F6PNebERUv18dq00XEbAUcT6MygRvRLmHf0uGFFRYPizLwJwdjbrXW9lAIbBrYp4qJdToi9pB3Q59dU7WUwPw3QI/nKi81j/IezpXIE4qu3KtmrIfKC48ywuWbnsYTUSwS8/9Uq7HbKfXHHm2RG+0NmEfcy8aZ1sQ5top6ot/YOHfIKASuDrXFXZcyW6gn7WmSJm/3tUFu8r/iPlKlJTsA6DasGEJJ3Ynuw5Hem3Z/pGbzkfOyhrd6wqcevYOB3sDAXTSpB1Zl6VWEiM+wr0KQ0NvSkRcdOy2hQaA3jjKbGOyDcg8Y8oaCw6r9yEiz8FHPztE2ox+Eg/A2EKBqVFoczadEv0b8wEVH7S086V0XCVtIgby+t4mjakGpVBlo+Qyot5iYeJDGO3BNkT8J0WMr7dq2rISWkK5gkkVI8MrkJ7zLm2dfhQDU8ZAYrM1kRYJSZs8JrJiTp+JNkns6w3pbu65lTs4hpTjLkExVUR8YvXFry6cph3QwkeoK+vCE7r5noIuCzfAmVpdHOP5JBO4oqLRGf3R2scDR8VIIo0d7M1uFungZBciVkUtrjIk5m421JvACmHYgws7u2XGv0es3u+YAl1/RlyaDPOSldvW/ZREAJns3vDvlcJ5ojzK4ZBrNJBl/UXVvhWDwgeFuWHQA2ZBJxSzLoc703pkXPeLHkMXJx0R49x5f27alji6vJJOwLKR3+4BfjnQUB1w/J1TzJvjjkS4rRIaWirgcpDzLzlVJCsZJUUxl1kxoyROKK0m3WtSTNrPYvZANT1jKNrXfp1dJySNVG1sa8XDLZ8ypoVldFmXgGW9bubnkaQjRQeRlAEl++JBSL613HaQPlBZJ4cQr7hu6Oa91YmUqTQxl5Emmrd9gSVPQagz5eVhXf0amRm03GSHiKCIm1hrWXzphKy5ZXvg7QcI+H9pi5qN0xWUp6taxMvfYmGBYsAAAgAElEQVQCy02K2ftVER/4C/dmehIC2MbyFO3o1PDOxqyplCQlMWaKmDw7O3TQlXNOzj0ZrDdU2+UNSe4MVjLcP0Q9QpCOxGmJb7lZ62nAcarjKhBzLd1MGwhvg3EfmlSSpp50x1UJ1UhegauoEMJKFlv6lbjrNTTgFDBuhIEzcUseDYywSuIUz8/fEVGCds6cgu3Qq7wCT7rmaQjpFveSG1YEA3tpNVBOwjYSU88kveYzpERaXvR87kWT8qzpqcceIPXeRXl1RRpUGEjGnMsRUd2Vc5GSQ1v5d6AaHnI+y3md1Wzymp2vALRxvuZjpWbiFAJdAXCTrmTVpiyaWMqEYfk+UyiLJjrYoE2TteWujUFLo8vOJjJmgDAMKVydrHOWWS81OyMEHMugM3qCvv4J4Tl4W7oeBsOfDJbLOehKaTQRI6naIpzvJvHujXaeD6KziXlud6hCa/Cmm7n1vg1YzyWDFbmehn74op3jU0QvM7CwJ+jTjiVKqwT8Ooiec2sQJ6TzdFIvEHgTsjCpq85nt4fIRRkeQ/Y4xLfFqXNfZYure+r0obX1QMbMkze04ZGWWM0xPKIBv9xsikKxeLqzpwZpPibtgw3yBGa2vqyPrabfKzFd0f9wLQmU/AcQXcnM9W5lq0J0qj8MA9cTMC8Yi2uTmoSMMXFYvnLc5mq/SqRk5mPr2jq01rHQXO1vJ4I31Vvk1ymICs3Txg+nlCHxzJThsfZyr7TxP0DAQQxMDsXiziWO6n2VcwGSGf1wK8UHzVrcoY2ZNwcqnyTQ7mxZe7kZck2BqrJi8GMMbAHmWZrfL5ngttDVQByo5TvZBmCJuvFZKjnvDkSgrZlXhNXALg3FHszbHTWMFWB0okndLPWchEmwRMIYLWiEtk+OIqyk3rfsEwroTzpBViYLcxFRwl560hogr4HxMpqU1Lkzk1UKq3j2PkNEaXC4E1a5LNIhd2+tpokQVkmhklPjrjJ8CoZjLV4FYRkiKu9MT7rEVv7ns+thIEnISITfxPDpl5iZwZ4hDsTzWZDzWb6bGKPPpasYsGPy3fKtMYe0kx2v2XmUtKoA0b3J2nJtLpngbUk8AKa9U0OKxqyYrq/gELxm1yMAT6AhVOpWxSFlu+K5IjI+Aax5Or2MjNrn9bBwQ7LO59p3q8zsjAAUIsKu+brilrZ0XklMJzLRH3tqy7XehtJo4jgiFSq/3617r+CNJt4GIZUM+lzD/9u2LNmoiDdPgOi1ZG25NlQueFu6XgOrDrYiBeCKN9r1NBHvxMQnJmsrdIUe6nze5tIH3igu28GTDPrcq+zyI5OmU+yLQ2JkYnTIAPldrBnBvvB2NGv885ixQ6p3zUg3/YuWY/zTLAsLGTSnLtYujbi0KE8DMCIUi7s2OGo+pmo/svhRMN8YautwFPKyaanxH8GMxcyIhdrirjOpTNlqLUCBUKxdWw45v6ZyhsHUzOBL6mIdrr8pGqi6B+DDPaC9ZsbaXV33GW9DmeWx9p61aKk2+VAqUxhoYMYMt1416e61ShhrE/bgwLpFetG3jCrp0QBXh1wEwhZOmzhkZerLfzEwghi36CTjVdwf2dbqGyqGuCHJjXH6MnkdybwehHTi4QtgvIqmPJUh6W6zwxBRqr96wkpLQo7384i4Cz9l8j9kBuVFJJuj0p9ZGIYipevxb0TU9a8n3TpejFwR03JPppWkVwtlKMZobZ8Wm3SljxgHetExIS1ONgJNcC2XV9SrqpyNMhU8+v+fThAWAyn/b0rnqki5/Bsu+1+Mdwm5bkjBpQ2NnM9yXl9SZib8DBziKeLKxAkVWjXiMrOrCuDnGJCutK5aHd5oVyOIZxPRpO7aclfdJa/ZtRDgoz0e3jUxo0I7lpXOX7YPeYzHiPk1i4xFPcFyx/HU2/zu3vB4noKFvyZDPldxvFJz2akE48Z02Wi5NqQuKE8P4zImWtgTLNdWI9phE7mekkGfa96b8rRY1i6DhvZWvDN9jP4aVZ+beF0UrnuCPtcy8LKWhLQeOcxgVOoSXm1Kza4IgauZcWVPyDWvRK6fjTY/6UbeaL+p47pPKO/rtf5PkWrGX3wfhodKXppUvtkb9XuU+yzC+FkuEtstU6pGpYr5VUrf9F3dnNFA1V0AH0G8ttxNwVTlXxSXdIPp6WCsXZurICyoHj8hRcZzqjNsq3u1SXPAf7EBnM9Ev3TTFZFqD2LrZZHuzdfMzqypvJqZfgVQtZshI0TTUux7k2XsF7x7ibZRWLTGHybGjcx0sZtWiIRsyIAMKDLTOcDNK9JS7b/IIpxtAb/KJxAWDfj/SkAFg59xKe+VgVluehJmEGRmrJ/t/jh80+b8UCxFheoK666Bke4MKyGtT1GKHV3LPMNKxGlffIKtsChvZ9Sk0qvI50EIZ2TDCYehMc+1HFbem9WIYMfsOh3p94oGhvuMJy2mdQhS8GNeJidGRxh/Fc+hyiuZ5yKkVo9FIByBYvhwU7bKyJkGPAbGLvBgAm5W31lP+jcxInmapYVV+EUGzJUowR74k1IzdUJc4JJzMFBzlgTxhE2gksHLS5ve2CZfVcrohW9vuurr4tcJ+GrI56t30pWNCl4zIRVw1xAbJ3WHyqRsUktZS+cfmelUNlDdM9OnHfdK579VTp6Sxyh9A/x7d9DnqB689cL3Ny75etU7IP4wGaxwvUaGNyf28HjoKbK4sTvkc1bDzZCpyllEhEe6a33ae8nI5veHrzVWdQD85UrPmqqPZ4x1ToyW/RTtbAQZs9lI7dkzc6Te2E4bKP8CeLdBgzeueGf6FloDJVOy/Hs2UNMzU9+rRfA2d54BAxeCycyna2JstOkK66vPti3Zfo8X1rzxnPskav2Q8vtTbcNDynfE6JCysH4Zwv8hMoDss8mgItxw5A5Huc2MhWjAL7XXb+XrYButrrwERP9HhnF08K4lIrmsRXqwEKE32BqXmaeW+dN22dpI9coM5Z18+SfRQNVsgCMMvqIu1qF14c2ZNr5kZMqQgSlvM7v5NVVBg3k+iC8MtXZoDQTBrKm6E8zT2aKDQ3e3axOAmwPj9yA2ngXxAre29YIZ8Eub6VGWhWNntcVlluyIqLcy+FYCInnDUIFKk0GVxPg81KbvK1NkGOf1WtblHoOQspSTLJ1DMbCQBOd0k7PdkMJuSivDdSaBsJIjH4Je7Ij5quuuM+lKl1NhYf+8yZxhlf+wDQZhpGvjuXqcAIL0bDgPjdB5mdKkEyR3xCfYFouyeQnOSLdbOT6l8LoaUvW4DoQzwDgSTSqpVE9YdamUFvPu7w0rPY8LYaEac5UnR08YUjkgCaUT0aTE0vTY+1Q8WbqSXaEBB4LV+GiBcbCrBsmW+AIfqX4+Yni6jj0/IqpJV+b/i1dAq0YseKOJdlGxxJrVE5L1Y7V5dz4zeVAKqX+AcUO+m1mp2XUOga8iotO7a8tdc4rKoonHLMIWxJD29brwltx4xbuyfbGV2nFZ3SjnxoQZvGbiExCeS9b6XEOg3gXdE8hK/ZuJXk/Wlk8A9F1sS83ODgNUDmvt7t11Y7ReAW80cbI0OmTg1J6gzzVHrNTsbCIyQh7L2jvhUg7rvbV7b1jWU+D8JctlzV2HscF3M+PhvLom0c7a9393ZPNa+WnpIoCjshu/PXK8T/s+DA+JLYkcrny2xHO0FmVztX8pAUNDbXnyP2qqaoh5ERPmhFqdpcBtooHKh0C08+otS7bVVXrYqLJdwpp8lRnRqTsdCMMj+8UMxfI2npNY4bBQLO4aY2uprqq0iKVm/fZQrN3VQMh0pj0dpMp7+3VctEnrn1jLAF4SisV/mt3gQLSm6nZinmIBp9XF4tpyK5UgyvQigR7M5z1KlzdbZwA0xErxPi65IhIGyM0lkpmx6zH4EbErvuS3uCfKpZVBR8PCTtqqDCEMyV5vAuMM17JNId1tVozy7RFRyaLOiBy5pcSu7kRT3vyPtFYIw48mFRrQkzZQpNJgpGvYJv2bZJZ7LiLQqk0qGnA1GGfBwCzcogwQZ0QK3lLVM6IKa4fknAmr/jQy65uRtxS5Ho+BUIUURruqkp6ESljq9zMI56BRqew6Mwqv413YsXpJ+nX/vj8etuSBIGEm+c6O3raylsT9zNgfRu9eyZmjte0ayuZ2bcFF3CX5TMmge7dZ74LO6bDoTgau7dF4L2xKzYRUGO6V6VkiYoOOZNRGQ0Q0MW94J5p4AwROBn1atU9BfpNVwq8Qi6Fv7JoMlmk9bV6zczFgHMVs/KQn5NV67spu7fJzil8C87xkqMI1n8rbnPgVPLiGmcJuoaBM9dB7AL2QDJa7euzLFnRtx5bcc9CVHPKMH9Onaycc3pbuabCs6Ioz9xyc+mSFGB5iMLimLKwnMt790jY8RI5bjA65schA912Rm6MtxysWtcRH13F7Rqv9/wBhr6GeHbacvmiRdgfMO3qXUk9R79sMWlwXa3eU+LWJBir/TKD6FGivWflzJdSMhz/+YlTdI/rOtC3TxvuslCGdcf8Vam2fkt3gQLTaL4Pkvl+vRoWubFVYOA2er3v9H4AQz2sgVPvPVF1EgfPXo9LmbWlxn0+rxKypPB1MlzPhN6HWuLYkTjBr/DI4Sdms6wxufqBqVwMsGv+rUpZxyOy2Jbr69pOLPXTD2hQXGYQPLFaeDjEm3Usjfzwkrmp7OeTGLoZ0/1lv2kDYFxYqMTfdodmRU7AzevFvMKJogjZerGhQfQ2CqjPszS5aHUK6r8triECrnKuox/kgXAbGDDQpD4GeBlWuLYPZBG2nWSHdeE0SVKXFvS60lqYeZ4NwFRjno8nFKzMNJdhchVUezNsVtkF5TsSAEa0Qx/h/FjsU1IudMd9Ftr0OW6NY7fOtpb2Ci9FxAjbFNfgsG4KTBFgxUPWeoR8fpR6Z+RqOk0NvNHEzCCcx+OD85aidPSBanqz1uXqNR7QkdjeYpRpvYXdthVYjSBC9CgMcFA2QZMinnex5ze4GwLpJRN/cKk0Er9n1IMC7JoM+EQZ0pdTsfIVA2zAV7dpTW6pN4C9r6bqcpYcy03HJYJm+I7T6/4kPmbG0J+RzHfO95rL9AeNBEG5w6/8ieM1EnIGNe4I+18k75jxc5B05WqpdNuMSz849x+k7DafVY/muVfHH8NE1M1WRSGby4dptfD2RSrDTvy/DQ+rZZSYhMXIbGcSk2VDbvOqqPwPWiZ+v4sln3r9UrG+xqOS79Hu88aidXkmlOHnG/a+KWyh3uyySJKWWk/fyHesdNuiixCerr4i8kJATILutz1IU3r38ykFFNOYv8eUnv//VWqlrV+udHo/1j7hi5drUh4tfe1/cYvI/7e3rLLuO2OSALYcW7xJ/78u2FV+ultnuOt8v57UxYfgmRzIz2t/7QkIm8ntyf3N22XxI8fDSYYMmfLqqtyv5+SoZ+HPfI8+zVGw2uKrYMIa+/cnXzzKvM+it4x4cWuzZqGKzIbt9tTbVnfh0pcR7xSskMx770X6+ev+RmweGDS72PvLOx9d8vqZXjqe4+WW7PMoiBpu8XnXufqNbhhYZ3rc++rp+QXuPVPrY2yVTXX636D2IloNq4Ocx6MuUxeKWluPvXqXw46MysXO+hhiVkmMj180DCOAKFOMwvI0gnlcXp33M5VxZ95w5DG1Yg7fxUFarI/f42M8lWHAcNkcQy3EtXspek7JdFjm+YqzLo4UpuBUGBmGxcp3b6+3Hb9gP+2IEbsGXmI+/wbEqIMvPcDlKMAXLMQtPqN/a182cfl0CD6biWaQQR2u/Sp91f9uhmIrNcTVWYh4WqwqRdbfnPh6rquO+xJ1qXNK/70D4MRz3Yi1iWAgZpPXvPRbXoxjT8DmOw2LVyG7d7WnSz2ficRgYg69wJu5SehdyzclxlEVKL2U8kpt334Q/cUe7hpcHAFLpJEa0aDMIYohkZ+ClzW+dQ2xcYa356lfLT/LLNnv8yo5h9jL8mqcfZLI2f++sSRJWtsclWezn6nHIdrtsOix0xT+x8sv4+5fWSMjE3pa7yDpsMuuyaYOGb9+Q+vyDRz/+08m5onO578Xg3Q8t3/jAuubUJ8sf+CRyZu75rLZnUM83m3XVLz1blh6+8vGFp379zD0ykcg95jZq3Ra/jFxrDNpohy//FT1p1Yv/tHWX7GvJ/jtrk2nnHjBo3J6/S33QZX7ceIb0IJH3yHZ7sV9bW194z50oLt70g98eLrmU9rbsdvt5yfYTB29x8h+e57Wrn37v1z+pzdlmL+p/yzLipnaTSkoOXdX+wLiPb/ylGOnqM3IWQT16m995EmRMoF7rp90njpYxd53tNuUtiUMtxt+/vL/p688WXlYMKyWGhxherh78/wCZ6J5hHyCJsYrRIReTazOy/wCx+sWl62rdFfjfgkgUl7O/WWaUcnHpZ9MDB/me4pXpe6Mp8L+M3Ia/8dc6eg8GKFKZJQatqJgKUu0i9wP5RQX+FyH6xLPZNptaX35m8NpsEECeSEK5e3+j9UfE1M78Pg0PG0maFHetzHRFnTLXGv22rGOl5eBkxa2zTv45p5/bi72t30LpbCIZVvptyyx9LUzd69xHIfczhb7Pse3GJaOJQCu+WGPflPu9x2bU5kP2+OjrNe98vjrVNw65zr4eXGQM3WpoyZjuz1dJ9Uh6Bv7NbFxmG/Y6Y+MSzzZrUrx6TcqSE8+exdiLfK4s6rlBVGwxy2+y/1/fx75IKELcoq6howGKlF3K7HDfjBEi6qa5x0Zwei55AgbS3qh1jp8G2Xf2+5z2o71OjoG8L/c98tzpbwp8d5yOibit5VyWypf/JmQ8FrVWGfe/hYCf7IKcaUR/0tuIDPVetuzxT3D4OwIMw6M+07K+MeecMDweEBFSva55fOo9RlGR+t9WKs9nGh6QYaj3Med+V2Hd68nwyLjJOZ/pfL3Jb5fvYMl+6rev+vyNjPhql+a+z/lzv3/k94vnTtIb7H4tGwLxTP3K/lHfp+FRoIAgZbPirhNDqq+BVOD7wzYmcxc7ZGA/7/votM5+FENHnucu67POfi1jjr0Iua91S+77ZKCX2bm9yI0n9/X6ruv7Ot+6vjciiXlL1ZOEEt0bz/13sP+Wp9185eDdj+pNBstdKwwFr5lgg3BqV61PvDxa0tUmNCoZLJcKIi2q22wvL2HgsZ6gvmxVKI0m7iDCzzxFm3gTJ2ymzaUTvKb0YKGXk7Xr9CDphzeakFw6mY2f5SZxLnjNzjjIGJasLXfV3hnd+Pamq4eUfAiL/5Sv0sdrJqT1wWGpVPHIFbPyia4lPpRO6H36qvRjRPPr+xk0+DEYdHKy1pcrgdDXABImDjvqlHu/+mf0dmv11xKKck96//ZIvuJZ9kW9oXM8ChQoUKDA/zjS22Tt6t4j3q8fra/ySucW7G4xX58MVrgnR6uEzsRjzHxDMljhmswpeM2E9Cs5KbtCQ7qpGm2bDJa5lqMKpWbn5T2rPrgQDbuLUeqKaJvkM2QEb0vnGQTjpe7a8v6J633wtiRCyVqfvhosgzfSvX1qqLXpihmOUug/FlLxdnbB8ChQoECBAgUK/BBISPKcguFRoECBAgUKFPghkBL6XxcMjwIFChQoUKDAD4GUR59bMDwKFChQoECBAj8Eot9zXsHwKFCgQIECBQr8EFwmKtwFw6NAgQIFChQo8EMgul7/VzA8ChQoUKBAgQI/BNLM8Te24SHaHRuqO22BAgUKFChQoEBfpHPzBQXDo0CBAgUKFCjwQyCdyH9bMDwKFChQoECBAj8EFwG40DY8JLwi7Xol3PLPH+K/FyhQoECBAgX+p5gjXb4LhkeBAgUKFChQ4IfgdwDmFAyPAgUKFChQoMAPwYUALrINDwmvHJQJtzz4Q/z3AgUKFChQoMD/FL8FcHHB8ChQYOAg1+MQAMUAinIWee0BYADqPX0fObMIuY+Wy5LKLL05z3PXFShQoMCG5gIpqbUND/FyHJjxevwrs+77ZlBmkHVaSnIG39zHvuvswbjvIshvs5e+2IOzYA/aukUGaadH+7m95L7uu63v8m23913f93XfdfZzp3V9t/d9r26bLN+GsZnz6wMAXwP4W3bLfyfDMufWKgBbANg8z7JJn3N8aJ/XsgweQLvCNkDspe/rb7usdVgnS77Pt7fnvs/tee6yPuvk/O773Gmd/fzbXgcFCvwv8xsAl3zfhsdGAK4FsB+AbQFsmd1S4P9n+g7KTsaf3IDOAPDn7JqBj1R9/R+AnQFsOgC/bt/93ve1jr7Hp+/rAv1ZAyAJ4DkA9wF4GEBXdut/FyMA1a58Rp9jn3v+yHN76fvaXnInJ/Zzt3W5j7nPnT4/d53T8/V5tOn7ui+yD+z9YD93er2+2+xlfd5jL7Y3s+9zt6Xv59uvcx+F3Oc2qwEsA/AkgBsALMlu2bDI+Hmp/QW+D8PjKgC/ynglChSQi31lZmafe+IfA6A1+2pgIt9RjKRJ3/Hr5RvwnMj3N7IvnQaSAj88i6RUEMCrP/y//tbcA2BK9lWBAmneAlQL+3kbeIecD+Aye8ASY+OAjPHxUGbdd6EZQCjzXFyaohPyfMaaeiMzmEq4ZHDN+OGTd9hq6B8Tn668bcGS5Qsz7ubcRQyXoiLDKD5q+63O62X0/vX192/MrFfbcp4rI2e7LTcaP2qzwQe899XqF9tXfPlE5nvkDuDZ5xOGD5s4fNigPePvfXlnz+erZMZiW9+5S6qkyDCOGrf1uWt7+b17X3//T/b6Potad/CYLfcfs8XQ4LJPV0X//uYHMhtaZ3vu8zMnjYqUeGizKx9752d93iOP2eWQUdt4D9hu8/tW9abun/PwW3ITzN0uv0cW9fy6w3e8pcRDR7Yv/2pi5IXOd3K25y4CNx5d+RoInzUs7tgjZ30/bpoyfvYgD920JpU675R7XxWLWM4dO7Qlz2Xfq+fXH7HDE7Aw7My/vyafab+nM/thwHEAbsmEH2T9yOyWgcfPAdzZ52uZmYuyB8Dn2bU/HrbxYe9r+5i4vXZa921fC/J8fZf/9P2yOP2NnK9yzmuvL4fnfV//p8/t18cCmJrx5orHwOZFAHtm3jdg2fai+55973dHigd6TOZLfgHgVgCn54QB5dFecl/bYUEJiUvI3Okxd5Ex2l7sMLkscu7kjt32GNL3/Mp9lEXo+zwf2TFP81yOqf1altzX9nN51C2yXY65/Sjr+j72XZe7yLrc8J94hOXRDh/ar+1Qpdtj7iKeuXyPsswGcBSA3QF4M/tEeBrAPtlX353zAFxuHzAxNvbPGB/iMvwuyGfYXhNxQ9boXJDzqsdPMMh4lsBPhWId8neONE7Zbeig4jUyi7BCsfio7AYHbg1UHdML/gsDTXWx+EnZDQ7Mn1Z1gCfFDzJbvw+1LZWZipZowP8Og3vrYh3bZ1c6EA2MnwQYjxK4MRjr+EV2gwPRgP+vst8NplG1be3vZzf0IfP7E0R4Pdgad511RwN+Sdz5DVt8bOjuDjHktJg1/ieZMTYUi2+TXemA/CaC8QgTzQ21tp+c3eBANFD5bwCjl8U6tpmTvph0VAKIZ55vSE/bhqZbXYgGLFhq8DtV7LDs1gIFgLmZgdsmDKAp+2rgQcZGm66yvvpMjAKhEYDrWFngf4qJAK7O8fDKxEsmixuCc2XS9n0YHu9mZrCuM9n503bZ2kj1ShyJhno2Hj190dPihu9H47TdNi1JrV5CREVDjY3H6t4nmDX+g8C43wIW1sXiJ2Q3ONA4ZbetBhWveYcZT9a1xQ/PbnDADPifA2iktcnn5XXRZZJM6EjGQFghnp1QzP0zowG/eG1O9TAfMrOtw1Ut1qz2vwaiwcFYu3Z/Cs3V448FGbcRcFkoFpeyJS3RQJUJ8HFMvePrWl99M7uhDwsnlg35esTm7zHwZF2e32QG/P9iYM+1g3i7+js63stucCAa8L973gNvjFjx5WqZIT0G4KfZjQOHIwGIcfhJJkH0DgDHO369MPYF8HdEsHF2nY4G3AxGGJG0h86VMN5ABK7GrqIBPwfjDkSUceROPR4GoQqRPDlX01CCzfE+Itgsu05HPa4A4dfr9f/DWALGpmjSjw+KMI5HBLdnX28IwtgKEXyYfe1GGNcggrOzr90Yi8/xpko4FtoABDLPByKLARyd+WInOrnTS2/v2YrWrn0nGawQr6Qr3pbEb8C4OBn05T2fvWbizWTQJ4nmrpQ1LwuwYdyVDPrynk9es+shgCckgz738zn9/z9MBn1bZVdo8EYTl4Dwf+vz/8vMRAcDGyWDPtdJcVl0WQ2TsWh9PnN9KZ+XKO2a7RPPa1680WXXJEMj1+t89pqdb31qXrDFVw8tkHFPPC3i6RLPyHfl15JPZBseYmxMzhgfj2TWfRvk7+1QjYQD/ph53o9owC8uST8s7B26O/5CdkMO844eN8xTVNIuSarssarqFi2Vm7ojTVP9uxUbeEoG/1AsLmELV9I3c5QEY/HR2ZUOZLwSBxvMO9e2dbjGbqMBfwKMT0Nt8arsSgfMGv+pzLiOiX5T19oulqWWaKDyIYD2JI8xLrhoiSSzOZLxtDxGhNZga3x6doMD0eqqs0F8JQOz62LxaHaDA2bAL96qj4KxuCRUaokG/DLYHu5ha6+ZbUtdE5PMgP8pBsaEYnEZ8CTmt1zGuuwbBg5i5ds3PnFF75AJr6xLA44D4zYQHkAjDsuudyKscp/OAaEBjYhk1zvRoNycY9EI94HyRFTBwHNgLEKTShDUU4+5INQC2A2RrMfJmbBKnvwIEbiez2jAbDDmgvF/aMLl2fVOhNEKwuEw4MXNyqBzJoxdATwDwh1oRDC73okw5BwWI8WewesJq+OXRAQSBtRTj1kgzAPhHDTimux6JxrwLL7GaCxQ/19u1BLetEMYAw2Zxdrh5/l9PDVpFi70eFdNXMHMy3qCPtf95JvfOTpVZLxOzH/oDvrOyW5woNRMPEcgXzJYLoUGWkbMfafCKGvoPsIAACAASURBVC56DcDiZNAnIS0tZWZnE0BBeEp2654x3PV89kY7XwIZWySD5RXZlQ6URxPHWaSu+wuTQZ90U9VSFu38h0W0d4+vfEvsTxLqcMQX7RyfInoBhLZkrc/Ve1AW7WxiolAy6JOwlJ6F7PGu7HoPoDeTwXLxUmgpM7sOZ+L7iOn87mC5JBJrKWtJPMZMOyWD5TLuiNda7ASZ/GgnqP8Bco5cZRseYmzIjFOMj0cz674N4mWQOKEwAYAYDf2QmxQBh1rMM+raOmLZDTnMmQNj5JLKOIjKiY3dg21LJDfEkabqyh2LiV5g4Om6WFzyVFyJ1vj/BqbJFnHlrNa4DBKOmAG/5CHMNsBTZ8Y6JFdDS7Ta/zwI3lAsnhvv7UdzTdUUg1l+84JgLD4ru8GB5upKGfhCBjwHBWNLtJ6oBdOqxqVSLP//9VBrXGJ0WpqPqZxsWPQQAzeFYvHTshsciNZUvcTM29TF4rkxv3401/ijxJjBTEfVtbX/PbvBgeZA1R0EnjrUUzJu+qIXZNYlnp9PMx6FgYbkKUm+kiAGoljr6xJWlS73K89IBO4Gb1iVkl0sMyk0qioCPWE1Kz0MhEo0ulzwYTUTSYLwMhqV4a8njDMBXAcLJ2Ju/1nuOoRVguRQROA6SKMBE8F4DIRmNKoQg56w6tMgWe0nIKISMZ2ZiY0wRBkI/0ZEiRrqCeMS9ZmMmWjCbdn1TjTgRTC2RgTl2XVOzMYu8OBZMFrQpDwCehoQA+Mw9GI7zFdGtITipFxcKvoGInY+n4R2HQ0Ab0tXF9j6Ihms2Cm7UoPXTHQRsKI7j4FSaib+QcA+vKpoVE9DqavHyRtNvA+it5LBctfcgjKz83QG/YGJTuypLXc9n0vNhHiCa4qMIaM6Z24tEx1HSpt7diBDPPG0MBksn5nd4IA32nkziOrRa+yXnF0mkwRnxJBbufeHIHo5WVvueo2WtnT9mpivZLZO7AmNdP1NXrOrE+CvkkGf63GqWLBsRK9lyBjyr2TQ5zpGec3OBQBNZ8NT1TPT+3qm2kUMahmr782+8dsjHperN7ThkZuIJ19WklfWIRrwy4DbAMZFobb49dkNfWgO+J8hYDcG7VcXa38mu6EP847epdRT1PsKA6/VxeJ7ZzdoiAaqrgH4TIOMI2pbl/wju6EPZk3VOfIdGTwnFIvLLFVLtMbfBsYhQ1cWjZx+/0uiU+GIWe2fCMJjTHg61Br/SXaDA2mvBC5m5gvq2uLXZTf0wazeYUum4pdZkrYszw51d78sN3FHFkwbv10qZSxh4Jl8BlpzwH8fAT9J9a4pnX3P6zLbd6Q54L+exLvFFAy1tbdkNzhgBirnMOhCEE0LtbZLJYtcBHdnrOq8btofgfEAOjL/V64PCQl9QwPGgrEUhGfQCNfjibC6IV0Pwh/QqKx+PWEVc6+DhWmYqwwQPWEV0vwSEfVd9TTgJ2AVYrkRjcobqaceT4OwPT5BGRapSiRnZmEYipRX5ElE4BqGQwPqwLgRDBNNcM19QhjdYHyEJjV50RNWRkETGL9FkzJA9NTjbhAOQi9GYL7yXukJK0/MC4io3CM9Ych1eToIR6IRYnAfqsJtaeyxdaAhs3K51iQU22+feaOdr8IwhiRry93DYOmb1L2Asf+gIWu870wf81l2Qx+8ZtcCgH9ORPt115Y/m93ggNdMvALmIclQhWvYojSanESUepSJbuqpLZeEWC0jzM7TDTKugWXNToYqtGNU2dyuLbiYpZrjlWTQJ6FTLWXRzl8yGdcz+LSeoM9VEsBrJhIEfN4d9Elem5bSluQU4tRiAl/THazoP8nJoSyaWMqETZNBX1l2pQYJb4FhJEM+Vy+ctyUh4l4Xk2XN7A6NFCNeJjVfZTY73s+/BWcBuMa+OMTYkIGz/+D6n2HHxIV+F54KMVh8KQO317V1aJMUm6v9DxiE/Rk8NeTiaWiZWbVR6kt+mwx8FGqNuw+84lesqTrOYF5AwEXBWFzrQps/tXKGYUDcXbfXtcb7uyJziNb4rwPjdGY60m2231yz81jilCRefr56bcmODfe+ILMiR6I1VceBWdygd4Zi8brsBgeiAb+473amlDUxePdS+XxHmkMjB9Pnw94AoTfUmi+8VPlngGT2ekAoFteeD/MD/gsMwkVg/nUo1iF6LVqaqysDRHQXGL8PtcXtRF455+Tck8HQ3a344yCZ9/bFJnFZyVj/hnosA2ElItgxu86JtNv+z5mwgevxRFiVY8rFeQUiuCy73gmZwUtFReM6VRX9mY0t4FEGyuOI4IjseifC6vo9EBZ2wlyVr6UnHYr5ABGla6KnAVPAuAuEl9AI98lBA+JgbJbXK3ESJsNSMgDzEEFDdr0TYeVdkpnW4YioCjs9YbytYtn5jmkYMn7JMT0LjcoAsbHPEan6kNniQEKqFuxZa7/x2WsmHgewU/Ld8q0xh9wSw8UrcRYIl6DIqE2eUKb1XpVFE1cz4SwmHN9T6+tbHbYOXjPxTxD2SJaXb+UWtthq3mvDSoqGdhuEp7prfa4Gr7dl2QFg458ERLuDPtex3Gsm3iLA6A76XMfHEbclfmKk6BFYfEsy5Dslu8EBr5mQsPOW+QwEFbLy0FIw35cMVUj5vhav2fUUiHdYaawe+fGMsa5VdWVmQu5JB1i9vf6e2aPFg+FIaXNiKnkQY6Yre4Ll4rkTxOMklaiS4yFj4YZAJDau3dCGh8SZJM+i343EDFRWM+gOZvy9ri0uZWiONAeq7iTwFDCdnG8GHQ343yaQpzbWPor63hT6EK2ZMB6wXiLgbrcciJaaCRICug/Mj4fa4q5uMTPgb2DgFiLjrGDrEq1X4rbj/ZuvXYXnCCjvZWvP2S45EC3VVQdYxDKgPhOKxV1djdFA1T0AT2bgpLpY3DUJLxrwy3HZ2eOxqmYuWipWvSPNgaozCHw9g35RF2vXWvJmTeUsZppLjCuDbXH7RHXk1kBVWS/4TQYtrou158ZsxY0uNwK5ueePz//wiEiY7UGSWeI3g3ED7gNjXwxCOW50KalNGx1Sfv0QImrg11OvZs9ieEjYRvIw9IRVeOcnKMFY/Mkh7ySXtFfkC0RUJZGeMOaDEYKBg9GYp8oorMKom+c1EOqxDwiPgPAlGDsjgkR2W1/SSa+S2+FDBNoZNE7BcPTibRAeQmMeDYoGzABjgcqmj6j8Gj1hNciORQSuVV4Z75HkskUQQd8bjx0Tl/Ck+3H54REPjiSy97veMqGIABmD/d0zt9GOD0KpmfgZAXcSEOsO+rRJ/N5o4kwYuJaZzu0JlrvmspWaXREC16WstfusqBsj1ZBavGbiXSZ83VPrc51sls19azsuHvQiwO8kgz5X49hrJp4AqKrISI3rnDlSG4rxmm9vDxS/DMYTyZBPwqxavGbXgwxrj6Fbr9nmrSPGao3QrRe+v3HJylUi3vVWMuhzNcy9LV1ybzqArLVV3XVj9CFYZXR0XiXjOBNmuxl9w2/t3MmTopdk3EkGfVKFaiP7TNYL645/3x4V7rUNDzE2pB5djA+xer8tEueTWfc6FlJLTdVeFvOTAD0TirVrXVjNNf4riPELMC50C8MI0YBfbt4jhnpKxk5f9IJ+kJJfOW3ikC1SX8qBTYZicRnYHIlO9e8GD54AIznUs7HfrYImGth5EmA9yuC5+cp2zYD/SSZMYItrdTktQkt1VaVFLLHCz3o9VtWJi5Z+nN3YBzNQeRODjmHgT3Uu3hshGqg0Afo5MR8TbOuwPVL9iB5TeQgskhvaDaFYXE4QR6JTKw+Bod5nhvLkqQjRgF+qYt51CIXJTUMEjCRbWqpbBhqS8Gon9IohnZ6FhVWewiUwcBBucdG9SRsdonnyCiJK20FPA2rBuEHydNCIvbLrnQirUk1J6NwfTXlCo2FImHIMPsFwLFLXpTP1uExVpYgvIaLKQ/WE1c1rTxTBiz/jy+z6vtRjexh4FKzyHY5DRCl8OlOP20E4Bow90YSXs+v7MgdF6MFyEN7Ju59OxjiklIEk1T62rpAz6f8fgAc74WaVHOqMVMWwUnh8FE3Kw9sX2cfiHatCPWrRlCes9sMi3i45BusYHqXNXeeQwVcxcGxP0PcXt6/kbe7eGZR6hgnLe95tHoM5cxxvRt5bu4+BZS0k5hu6gxWuoT2vmUjPgi0Od9dVuJYhe83Op0A0NjmzfBsQaSebuzU+X7xi8NZxMJWnODV+Rd0oOWaOeKOJO0D4ucGY3BXyaSfeoxvf3nT14OJXAf48GayQRHMtmfDSdDasiT0zR4pnUovXTEj+YnG+qpjMZ54AGAcmg2XanD+hrKWznhnXMhDtCVb8MruhD5nw0hsMSCJx3/xA25EgeMvMrjO6g+WuIaD1QM4FCc8rxNgQg0CMDzvj+duwW0YoLGt4zP9ZZbnhoXaAlwdjHeN1nolojT8MqfRgnlvX1uF6ojYH/P8iYKJFcE0OtVFGCmNb3vSLkbpy2LmBHSuKuOhZImyUSll7zVq89JXsxj7MnTZ+i6KUIbPIJ/KWzVb7/wLCT4lwVbBVn6uRKS/+N4N9hsWuYZNojf8isMS3+cFQrMM14z8a8MuJcoEBXFLrkqsyf9p2WxupIcuI8M9gq4tHqsa/AzFeJtA/grF210QlIRrwdzBo4zrnUuBpkno1gA0PKfuzk5rTMc6wqlZ4HYxr0KTEcJwRo8NQiZyfwoM9cYtK5nMmHYoQd/UnKMKe+LOz7o0inaAqx/9UNCkRNj1hlW9VvR4JqhKq+BMYV6BJxf71NKAZjBkgTESjutadSYd3xCiTOPF8RJTgmjPpUIhU+hyHRrje+BBWioria9gus0ZPGB+C8Qqa8ubfSNLrhbAwHXNxV3a9E+nwkpQY75Jdty5yUy/CXvgjJigxLikxdp3t/4DIdS3VZ1lDX8IWg4qGSk7LH5NBn4T4tGzb8tY2RVzyOBhlxHRkd125YwVkmdm1J4OflPBaMuRewVFqdh4kY4kY6Mlan3ayI2S8Msd4injHxAkVruO+10xIL6jJzDi2J+STyY0jXrP7YsA62wKfuTxYIblVWlTYhLmimK0dltWN0lZYelsSl4FxngEc15XPkDM7nyDA35sq2W7FrBHa/EBvNHEdDDoNBp2YnFEmAoZaylsS4rWXkNrzyWCFq9fca3a+BtCwpK+8wiG8ZXvIsPmJ1146dL9pv2HQr/N5r/Ig18QfNrThYbtmlOHx8OTJRZ1bfCQxUw9bnkpd4qNZXXkUGxRj4G91Ljc9oTngv00OKDH2r22Lu8/21I1PwhHWwR4P+3UhhubJIwfTFsNkEN0eBh8VuqvDNQ4cDfiTBHyQt8S02v8nkMoGXpyvgqQ54H+SgJ1AdEqotV30IhwxA5WnMej/AEqEYu2uM77mgP94Usl3HAu1dbhmaDdX+1cQoSsUi2uz05uOrty22APJE2kPxTrkXHHFDFT9nYknDjV22GL6okVOs235ThJOG6gej1xX4zcx+5NwKm5R4RNnTsRsGOpmI4P7foioXAxn0vofD4GVob4vmrIzjP6ElaEm58Yf8upLNCjj5AIQjne9mdfjcJDK61iQ1yvQgAsl4RophDBPqbfqSXtFpBxvievnNuAUlXQqN/4ILs2ud0LKVhmjUYoRmJPxPulIV+WUIJKnrDW9T2X/XIyIMkD0pMNLWyACt3i9TGwG4RBYGIVb0JgnkfaHRULM8lvXud680WVnJUMjXXO0ACZvS5ecp15mvrUn9P+Y+/L4qKqz/+9zJ2ETcUUgk0wAcSUTQFERwb2LS5VMRK3ILEAmaGu1tlWr1uJSq9a22rolAWYBl4KZoNbaxQWX2qq1aia4I2QyM+JScWXN3Of3ec6dGwi5505825/y/asvmXdMZs495znP812qr+n50XZQXAWD0iA8mwv5XBVJ+7S8M6J8QPlqwHwiF6p2HZlVxDuvIoMWcAHn5CP6sYGgMtH1KxbqM/P1ubBP+3dVJrvmMuNWJo7ngz4hf2vhTXQ9DLBIUo/OB6u1Z2RlfE2UySMFzBW5kM+Vo+VNZOTvmGmYmNIV8WnHS0Wly7UiNsgFfa7PyKhk/iCDC88BvIULnkn5OV7tJcab7HoMzFMBY0IuVOmkGrXJ/9jr4pg5aOIJzbmgT8vN7Cd6FR7yQYq+WzZBmXP+XyF6fxmBKJVCvN7fTkyjurs9E+Y++JLjvDNZV3NQgUi4F2m3Q08grpxyMyLQ90Opdvd2sBx89f5fM+Ni9tBJkeV64mc84JexwRQi/lGotUNInVrEA/40AbuHUmnX2XYsULtAZpYMdERSaaeWbA/igdp7AZ7OQJPb2KRIOr2DGQViPiK8okOKOkfEA36buPmPUlyRWJ1/lUG0i5tB2bKZ4wdskC4P44NSPiWCRKD2doCj8ODo0PK0TmomBFZ5SHfWwmN7zwO5uWtHbz0Q0yvLv2ZQ8dDXS9BEFWPi7yCUgXE+WvpYs2/DXBwFjxqJrkCzcgPWowH1INVJEoKqdEicEcURIDVaFP6JKDL0aMDZihwL/ALNKtpaj6iSte4PxudocZH4zse3YCoViHAlShFE5dZ6Ikzsj4XKTVaPRvxVjWwqsLdrgWJ1r1aprKBmZQWgRxSigJuKTRiNJP7T8+99IaTxwTgcL+N5bVfk64J4vAjf5Us/b95k1zKYLPvDulzYZ5uP9YI3kd0L4DcAM5MLVWtH2ja88UwORO/nQlWun1ORU7ICjF/mwj4Zc2pRkej6PoGvJkZbNuzTSqEr4pnTiKTLyE/nQtWu6iVvIiNOxWEwn+emihm5aO1xnjJDCu6FuZDPdfxemei8gUEXwzTm5iKV8p04whvvDIJIxk/ynq5F7PDbVw0dMHTYC4C5L8jz7VywUjsGrkhkFhFRkAjfyc6u0p2NspcpifpuMy9r/2T5De4qs/5Bxj632oWHFBtyOMlGq79xlYYtPzTjgZp/gMlvlJn+4PJVjoSyZTPh2WDWvAMmo9C95WB32WbNbIJ8AXRbONXuftuT19f7G4jRRESXhlxMuuL1tXeCWdrRd4Rb045VvI3iiOcw4q1jQm2vazefokHYTwH6vHwzT5n1cFprlBSvr70VikzLT7uNTWJ1Nd8gUryKLTB4hltXZnG9f6zBEFO2z9j01Oo6TYJYnf8xIhy6eeuACjelTSLgf8sEl0dSHdrixEZsRs0FZNDvit2bO3t+0BdqEf5fNsKvCEIesyXXwlPQfj4KDTgGpMz4pEC70XUUIv4bhKfAyj30Dtd2vHAlJAOE0IHmEqqQKPxKCircmWYVbucMeU9So5J3SqpStr3n8pIHdCNuAavO6R4wMB139XBkesM2PZNWbinSbVQlGDfCg2/hTqVk0aMBd8LAPJiYihb1/npE8QEYb6BFXbj0sOTNc1GGo3FHif2xHCa2KnKpjC20o9WvCaLqkAvbl3revPHOJhAdzOBxnm461NEpc8ETZd4x494B8eZcsLQzqTfRJaTPkbmQz9U4cERy7ZgyNl4F0cO5YJV+PcthuiR3GpmF+8B4JRf2aQ21vLHsFBimeM908cYyf76xQvtcW/wTWgDm3+XCPm3Bvc89740o37L5HRA9ngtVlejedM0l4ttB/JtcsFpbSFUm1waYDelQPbgD6dMR3kTXQ2A+AgauygV92r2nMt51CRMvAIwrc6FKtzXaoC4FFuQC49rB6Sek8/87u/CQh0m+KCk+dLfT/kAIN6/Jm8YC/o3l5Jkwq/Vl7Ww5HvDLjXwyk2dixO1120iPD4ZT6bqeH2gQ+85BU6i87BkiWhxqbdeaGsXr/VexifOJ+KFwqkM+ZC2KBM1ZBvGUYGuHdrYdq6s9mwy+AyaGmERT56TatW32eF3tFSCeR0A+lNJnsCTqJ0wy2XyCQOtBuMntMC92Jl4BYTSBjwi1djiauAniAb+YY80yQVNcf896/7+IufpzD4/53vJVejKh6mBNmGaSuZKAO0KptJbUJDjtwH3yD77+vkhB+7DsdxLIWrPJwO4dj7kYB4/qMElBKl2Jq3p+5gTxlTBwIFgdvPox3HnYAwV0gNVxJooLW97bF9Zr5TnqRLPiWzlDCJJ2Z7IbB7v6WlivlRHly2hWPj96COlWeBqMg1XxoRsbzUEFylSn4e2SDqJRRXgVO/bvo0kVIHpYXiniFXKea9EniEKcMctKckWiihx6Iwjz++E0+ybiGIvNSgEgnUv3NfDVQ27MMiLsd+HhjWduJsJhzHwAEzXmQz5HXxnx32ApNjeV7et2kAu8iYy8x4nlZmFfN64EFnCZd3RXngyszQZ9ruTsUfHOQw0iETB8QsAh2VCVY8Hru7tzbKFbzjjajUCHZ0NV2v2xMtl1DjO3APynXKhaRnJaeBOd74GpMxd2/z298ewpIPMBEKVywSqturIinvkmEf5ChKezQZ87R0l1UDK/Z9DpAIslu5ar412SPROFQpKI7i4lLx52xiXrPr3/JttkTviBkrPy30I9o3bhIcWG3KSk+NCadfUDcjN7Q950UZ3/2DkuHIxYwH8XAVGT6cQ5be3altCSuvETCobxT2a8Gkml9ZtpEZLtMrCwpatokqWVOyXr/cL6FXvnV0KlzbSuIeBKsBkOt63SttokK8Zk/MUA1stDWjTJckQiUDuPwbI5ecoJU2ZpSLJFcu7jYPqcYP4t1NbhyiqOB/zSCTmaiWZGWtu1bf54fe0VYL6OyAyHWldp5/XxgP9vDEz1eMyDdJ0rGz1ZNYxnwm1pV7+IWJ1/xQOvv3fyitfeF7XIzlp42BwUgb7w+CEG44sedUkazQ421NujEbeDlZS43bUrIYgqW/NqmJjQD18N4TXshvUYjeXqcOmLmfBgT7SD4QPjULT0kGedEVXy1y/64WshbW3J7BgAxo+xUI1l+uICDMRmvAXCVjSV4F80IgBWFus3lzRds2S7Moq6C81qc9PDku1OQDP27Pk3JzTgVBAeEtI7WlQHQw/LdG1csTCUYlo6ea4k+a8BSj3S38KjMtEphn+SfwUGPZgPVzmS072JzD+JpIim8boD34Y3kZH//g9NKpz0bnCM1sBR4E10vgoYu5SyOFfdhq2bn2eiCgM4MRuscjx3FJHWM+TvTFxtsDEnG67S7s/eePYEkPlXAl7K9lV79II30fU6gwfkS/h/FEm3Mrp9KRfyafl5FYvXTiWPIZ3T1bk1q2ux4Dj9uFCNTbp+QuALi86o2u5hZbLrCGZ+Vp6TXNCnH4Fav+vKTx747RGfpX4j3DaBqPNcjdr6CVX82oWHFBvyQUjx4eosVwJye5AblyhXtEE4yRn+sGlgIRMuibgoPe45rWbEZg+9QoTChs2oOd9lZGEjbmWLfBxOpaU97AixLSc2lxFRtmwTDncbhSRnTphtFswEAdeFUmntDSY2c+JE6i48TsD7IrENt3Vo8x3igdrTABbfjXIYdHL4/nZHz4RlM48cvKHw+eME7mbgvXCqw/WQKkpsZ4FxRbgtrU1QjdePrwcb9wP8y3CqQ9vqiwf8SwkQx8Fpwdb2kutCZdUA68OptOssMB6ouR6gS69d+U7r6o++kJtEH9+XnQQyp7W7SxIF7qiIQhTiXCst4/VoKZnVIp+38BnWogLHYYGLNj6qxgoniCoKTSX8dSwy5zR0YyIWQ2sUhGjRpZhxbD+kuDJeqSp6lWh9CNCI05W9uJVR8ocSChbptFTCwEEllD7SNRFibxuaVQS9HudjKApqpPOPklk5lipHxkXuWTXnYSwKypX2ETSVCHyT719cSwdif/xeEfVlHCndxJJS868Y4rcj7fKShUdlovNShnEWsfkqQJt0fImKZNcjxHycQZjcFfTZLr+OqIyvnctktDDzZflwtWMRY0PMxBh8BMEzJheq1I61BZXxzFMMHEhkXp4NjdZy/4oeGH4iviMbrNauUStXxfgHg78oN8xD3Hw9rFwTjM8NrtoHZ5ITgV6hOrluTLe5RWItvhjs2aXm7XP3cvT+qUx01QrvRMa6NACHdn3XYay1HSrime8S4XYCf4zBxuTsmVWOFgyjY2tGbjXK0gB/MnJT1UEvNpK2c1qZyMjZdMa7P5keL7zfaU8CpNvnzsPqH8T35na78JBDRVpEUnxoZZz9gOiQZfPRFh7FG/zbBPpDKNXuapIUq/O/DMKBBvHhbiMDG/3JFknW10w2QSIJK7AHR0aWp7WbT2LGhMPZ4GcJ5j2hVIf2d7UMskzp2qwn4F+hVIeWBFT0NFnJwAcG6Bo3kmy8vvYhsLmLtAWHeIZOc/cVqfkRQFcyY3GkLa29nRUdVNMMWrGDmVcvJOpqbmKin5hE58xxUdnYkHGMHL7hVNp1ZhuvrzkTTEsBujmcapdqWiR0iozc86KdB/I52gWkc+EhoW+E49VN34NjSgSfCYdHbnwfwcR0LIQ+wdcKPpNW7LySCa1RNVZoAOHbaLLkb46Iqi7E6TAxV9uRsGE7mBbgx6KihNUJVlaL3M6eLfIl9Kx3KaRkBEOY7HroR5Vxm/guSEeodGpxFGtA2ICmErbxVtH3C7Dy19AS+hDGIAxQnZ61/fBf+R3Ee2ibK6qMcA4AlCzXtT3/NeDq4vjHtfAo2oGfBzKfAhtVuVCVY/eyMpG5m4HvFkw6fp1GWmujIpGbRGQ+z4xkPlTl2hGsSHS2EChCoKnZUJXreeRNdCYBktt7MhfyaYnU3kQmDsZUNbpwGTEoX4sBLIGLo+ExjsqdW6mdABRVKTMAo1ajClEoGoS9JFleBnC4rkArupdKR2RPk/mod8PVjuGpNiqSndMIxlPquC0UpuYiY/S/azLTDqbRBvOkrrBPK0qwpcDyveZDiidjdznkYqHlIH4JKMdfu/CQL1dmrfKQuROy3CEyM+k4aAuPeF1tjoiF0+A62y3mn5xMzPVuplc2isqUozZvHTBSR5JMzJzg5YL5TwaGGwbqQven5f/HEVJMFMDSun7ebRRTNCeTjsVWF0NTbwAAIABJREFUIvo01NquJRa1fKd2TFm54mp8wuA/RlId2gdF+BcM+AzCJI9hTjt3ud5XJBGoOYtBEii0MpxKa1ttxd81W8y1ceGUKHLs75hweaQ1rb0Z2EjU+Vcw4RvEW31upNsepQ3hkXCrGsXIzF4Wona9fM2QTVo2a0FfC+x5OB6kRgEFMI5Bi+ItOKMRJ4CVguPzIunScfNRENt0wsXC4nftHggst1O5PV6OZlXUOMPyypgPsbjvbfHdFw24HYTzwDgJLT3k2r6wVCFSdIjhl/AlHA8ohUYsBeO7JYsjgeW0KuMd1/ArhajikQj3ZXjPvzkhihlgxdcRrxJtl0/B4n8MQrPqXOhhh+7JAKm5R14tn4V0/OS7dvX4+Roga0nm9NrCwzKeoitFgg8ypnRT+YnvBUfaeR09qIh33kpE3zfBoXdD1XYwqCOsEcfgLoBeyoVLtPhjnZexQdcTKJoNVWkvZYLiISnjUAk/00q2LQdPnEZM72fD7nyJimTmKTJ5IhsUdXP7rIx33igXMwLVZ0NV0vHSoujVcRiI67LB0eIv0gcjkuv2KeMt0unwAcbMXKjS9cwbGVsz2mN4nmHAQ2Rckgu6KWMyD6o8IRgnuhmPVcQzESKZRHiuzge9IrQQNY3d6RKVnGSx/bdQXeT/deEhRBQhCzkeJMrB04pDH9nzjw5I1PlvYML3QHSJG5HSRjxQI2qXsFugnFLQFGqeBRtjDYMvD7amtQ55TdFDywd9uKWTgY/CqbSrzXSi3i8yr10Z2Lts48bp5z7ytmMLzeI/bH2CiLvZRGe4LS1SJUck6v03MONIIvgLJgfnuBRe8cD4owBDFuyraz/aa+KClSu188B4wC9ZBBxKpbWs8yWBiacUUHioqPJxn5XLexazagomnzR3hV5pk6ibsD+T+TwIH631p8ctsEYM0o62NwxZL47mcl8j5LC2OTV9Q5KikPClfcE4EQtdHEyjinQtPCqJTD8RzeqwdoZl5vWrYsS99mam0IhvFIuZuCuvJKq4BuLrsbQfAW1ymEoX51LXAkXGG1uxEgYyYOyPAo7GIji2edGIG8D4YdH0TPvcKUQhN8ORJfNnBJZsV8aPB6NZZaw4Yz5Gw8RrYDyIlhKbZyOeACvb9n3RDH2KqsX/EJLkrWhW3AkbNl9Obq4lvW6+YtxSvME6cqq8ic4zALqDiR4iU0YSVOfE2fAuyV4O07yGDc9l+dle7UjZRmUys5oZ3bmQTzpBWtiyWQJuzoZ8rpyeivja7xGpwMlX3fgKFUsyPyYT85kw1CyUT1kXGaV3ME1mEjDxLTL4FrdRTGWyq4GZm5n4p3mX1wmKXRGRjf80F3FWmlQ05YcYgwpPMPFYMvmKbLjancQsCqKx456EycNBuC8X8mkpABWJzpvEfgIwzsuF9MZj3kT2SMB8BoSluaDP7mxIp9U2gBM5e0nDyH5A9jfhdypIsSEEGik+tIqNfkCize3Nx35vhWLEfGSrp3z8vOX/1rZu44GauQCJzndxKVWEIBaovZzAvyDmuaE2vQdHot6/zDRxFBloKiWbjdf5V4F4j817D6xubH5ROwuTv4mBg0AiNzSmh1tf0d54ZWxCzFKgDFxbmz6qePD2Qay+9kJiniNnMAMLI6kOMVdyxN31/rFbGc8TwSgAk91cXBP1/r8z48CPPEMrL9aMbHpcSYkeDrW2l5RvCUHXZJn98Y/dQuIWnXbArp6yAbKu9mWPZ3Jk+cu2JbY8lPZBsM2SfOeB3GLtg7p3VoE13giCMBdNLmMLK7ZeuApCkDsbzZYhjyPmow6msu5+Fk3QdtkUrGJGDmlJxtVuvJiPWTCVHHRlSdmqbSYm36nbyEQgoxhZooTDUIbjcIcitvaFhKmxOvB+XbLT0IhH1AhKijm3MZSgUcjeuAYmZvVjbCRckrfQrOwC9GhAAgbOQTcOx6Ie47i++D7GYAteVZ9VU59xihSg8n3I/39JL4uvGLJmZePv0/GoimUOMw08TYDEQJQPHLxr3Ttn7tknisKbzM4Gm8KTuSUX9pW0NfAmOkVpcsDugz+rWHXmeGfCs+p0dO3HBqdB9MeSslkpUBj3EHhdt7llyro5+zk6fnoTnSGAREAwjBmBfNinvRhVJLpuIPBsEB50M8kaFctMNwwhJ9OiXLDKlfPgTWZuBtNsgMWDQ9vdrkhk/kyMg5loUT5UZXdYtfAmMn8A2A+m53JhnzZ0sugBchcxbs+G9YVcVTyzr0kkrqwv7NCRksLa9myRz87d66d/6FV4yKEgihEpPlznSiWwq6SvFv93T+ERr/NHQFgsc8NI6yuOVZ+g6FUhragnwi6KFBuJwPgzAGOZSeaNkdZV2qCyWF3NLURUD9BD4VT7jqFOvRAL+EUKOtnwmAe7qTjidf6rQaqVeiCZOCu0Qj+2iQdqFwIsXYb9YfI0nfFXrM4/k0gxftsZ9IqbX8mymeOHbigYLwI8TmacbimyUnQx43SPxxyvc29NfrN2F3MoZ0FIh1vTru1IQWLG+MNhGH83GbFIW1orWRYoB1PwZDBdvEPwnxzCdhXdd5Tx9UN4FlL99+7gNeJkMB4oji36RIv3gphZiVqsgO9hYY9Cpi8sB1MZQ72FzZiIuAOfxIZ0G7qVGkXGEdruFRrwLZDK5hCljatJE6LqkJRu4WMlI+6jkLGeTx2wHhyHOzX5TpYVvLSh7ykZeteAhSCEUcAxWFTCxNB6X7mBiUGa9rlX6L9s9mfKlZUQQXNJV1bphLyhKWRkHxCC6yo04Bq0qBb1zgL5u+R76FV4FNv8Enw2mIhbdJHsRVXGPwh0XzZU5e7nYh2oyuKcyqgmO6tKa5fwZULSRiUzkw0Tz8CgbhAdlZtd6Ri4WZnoOonBMlrLyNg4H/ZpyfaVia4LpXvBjJfzIZ+WnGzxP8SjR0zHfPqxovWelzLMi5np8byLbbw32XU/mGvB/EQuXO1ayAisYoZPBajLzRm2cvGaY9jjke7dH3MawzeBfPblGza+RWR8nAtV7ahck5Goba72N2+iszkXqnaPFCgNZRppFwdSbMjGI8WH1s+hH5DDw75Nq/cumlnJbehut0Cx5MzaMabJL4Ppvc17l4936zQIFs8cf7BRMF4COBVOdWi/2ES9/2KWHAjG8+FU2rVVlAjU3sfgmQbRVDcVR7y+9jwwX0REzODfhFvT2tZYPFB7PYOPJ2ASTDo5vMJZwSIjE4Kx0mR+kETjmkrveJPqhXig5mmAJoPoXDfZbqyu5iYi+onBXB90CagrqoE+KTVaEsRmTNzd8BQ6mfFcqQIxUe9fxIzjmZFyIL3am7RAL1f9+iAPmXR+eqtuovgYhKdLJqNaXREZqQn/Qm+xbpl5yaEvHqaH4Q4XMqcgqp7RsTBRo3XxbMBEkDrA5dYqCg4tMx9RNdaQbl0Wzcp9WI+osjWXW9GBMDAXd6nCoi+2yVul0+LqDFnMn7kOJuZhoSpq9Iiqgkeych5BS0m1iRAea0vKZuejHqbKyrmxH4WMfDcFNCsCqRPk85gBA+9gnkqoLe2K+tVBzKiEsNyr8PAmMlmABrBhzsrPrnbk31QsfruKyga+CuYXcyGfu5+L1eL/OYEWGB6c3XVuibySZNdbzOwpJUdVygxP2T9hmiPJMALZYJUjX8Ly9JBxJr0C0Iu5UJVW1lyRyEjHVZJx8xs9W45wi5mvTGTyDFqXC1W5drIqEpk5JONSordywSptIeWNZ+4E8bFgeivnUhzY8CY7LwIbF4HNLd3G1mnvBcc5qsJG3Z2v9nR3tzOhMxf0uT7PFYnODgKN8HzB+2fOr96RGG8p4GRjKh/0eMXCN6cy0JYP+bQ0gX5AmZLZhYdsZHIjkg9U32IsDdmc7Xaaak1LMqnokUvZdsfra1YRkw9sHBpqe0XLEBYk62r3KRC/SYz2cJv+dp4I1J7B4MUgXv3phk1TfvDI29obdTxQczNAF4ERCrellU2sExKBmjoGLWTw68R4ItzWoXWzS9TXXsjMDQwMJsZ14ba0cBr6QBVdBZYv+WkG9v9s48bprr+rFTz3LZGlRdo6tB2koldIM0BXhFPt0nJ0hAS5EbBbKRt4G0XZ7KelipR4Xc11INnoqDOcSjtV53ZbWlDaGfSrh/AnpL3YuzUtBUWzIknpEVWKmGth4kYs7CGo9kUYu2OA4ljtCwMn4C71sOthSXelgNbnuliFhLznPiAc5RrmJoiq7onwTw5wjaOP4gdgRVAdCAM34C4NX0Os4C3n3DVoVkRLPebjTJj4gyLSlhrFCBrxLhh5V4M0QVSpVs7EVkxCDFpidnFkJbfmB9CsDmU9rKTfsWjGPj3/1hcy9jlbCXzPwfNoVqaMOwvs1rnsLZY/wzL2eDd23Z0L+bQKN/WaDV0ZED7JhXwlCb+VsbUB9nhErv+LXNDnGjroTWSEE7P/wE1bx77TuK9+7anXdkp0/QFEdHk2WOW49iqSq33E5Y+D+XUQKBeq1sZVVMUzR5ukRkufmgUcuW5OtXadVMQ7VxEZQ0t5ilQkO79DTMsI+Ig9xhG5cysdLwbeZOZKmCxkzvVb6eNj3gtO6EPg3R5F/o38zQPZMKe5Jd56E11vArxHoVB+sGvwXKLzUYCmk4cmZ8+tclKZ2VEqGFhzzOa9L1nSnith5NYPCFm1xS48pNgQ22QpPvSR1KUhQVd2p2JgLOB/noC9wiUOtHjALw/EyTD5lLALQVGwbOZMz4bC62uJ8UWoLa2NJraksKbc+D7sRveUeanXhCnviKLF968JuDbkkpWSqPMfyYSVRHiUmT90tzivPdsg/g2Li6Sl4nDklfzupHEDhw0evJLBbxHom8TG0W6FV7y+9lcAS7jRb91yXZacMXFqt1l4GszxSFuHlnhYdI+tHeIZWuEm17Uhslk2URlpK0EQDtSeD5iXMGOXbipM1nz+tlW/wFmu+vVCSKByu5OCSAqj/mE+ToWJFTJeRJNqLeoRVV4aE8C4wFXiKYgqae8FIAS1wW8LYCAHIfGOB+MstKiRhB5WV2AKDEx2Vdo04iywMhHKqxyYJmW+1xeWe6q9iY0vUciI144URff3qysQVXvTcDSrToIe8/BzGMoh5RxX/scc7IoyrAXjTbQo80Q9xGmW8A0MwH64DW7eClbhsQu68cVO500jJHU5iLcVHv2ASDGZMXyAWRizNjLG9Rkdm8z7NnP3G2B+MBeudiXyViYyEgx6Mpnkz0b0oxhBcWxzDIEWZkNVjmF+o2NrBm01yh4HzByYJvCAsqn5cyocCcLexOr9gXLZf4T/8R03/oc30SkGjofw5rIKN1fWohX7kwCVcaEwPT9ntOPFQDoiIPyCTCbyGNOys6tcO5yW8Zcp48xNDJqtc48VeBNdjwJ8rMl8hJsc15vILAbRbELhdJ3SZjubDQyqPX7TpvbHZY/+b9Gr8LAlYFJ8OM7M+gnpciiC4J2njf/LkDLjqLJB8M26R2/QFT/DL7fCH4p80G1kYUNF3AOjhnjMsWdq7LtjM8ePRLfnRSIebhBNdx2bBGpOAegBgOLhVLujSY5gW1dCNN60V7gtrSX0JQITjmOYjxLjL0yUd3vfeMCfAmETGHUS2BNqTWuzKHq8Oojui7S2awlQi06bVOEp65bi5Vm3UUixc3L6VuZJDW0dzuTA7VAsEL9RBtr/3FS7YyUviNX7ZxCLYkWWl3luONUhPAMn2CM+QV/VyNcPKQqkoyaW4tIRKA3rti8H+F/Q3EPMckZUcT6+CcataNEc5DbmIQIDd4Fxk2t0faMK0xI1xZVo7jE/c4aYaQHnwsRpaFFjL2dYGTRSoIjroZBZdxyZbUMj0soDgXAImpSZoDMs0m1emYS5BcnZ6G9I3DycBUMd/teVtK23Oj3C/3Bt8Tt4dejhRR451XESNYhbiu3XAXu02YdcqoM3nvkrCFPNrd3j35031uny0AveREba/6tzlgeEFhXJzlsJdAFM8zu58Gjd/qAgtu0gnA3mh914EEUr9o2qy8rGUblQpWP8x96LPth1oGfj30E0ksGX5UM+rShB+X+Az4FpHp6LjNFeyi2CpuI6DZIYDl2CroqsNxU/bKDBOKYr7NNy8wSViS6vGIoxUMaEG/NBPVfFG+9qAnGYyPxuNjhaO1b3JjPiMHwlGXRZdnaVOOzqYE9CQAOHPMSbN7jvZ/2DXIIX2oWHHOYyC5Lio6RRlwuEgKfc2+48bXxhcJlxvBvpUeWayK2QeHF/pJuJQO3jDJ5S6KZJcx9s17ozxgM1zwFUSwbODt2f1laHi+trj/Awixb60XAqrSXU2VJYMK8F4dBCd9nRurTdeP2E8WBTbspyaO1W4uC/DcQys5bOzY3hVId2vl0MybuTiJ8ItXZouQUMUCLgF5Lof8Kt+hRZNVoi+iED9ZHWtF5pUUSirvYWEP/AZPPkSNsqXZqh1WnymE+CSeKuY25ql+FDBnz2wYYtQ4v/p3TLtM5/XxNkIxHSp9zady/5O1h25O/BxFslb9BiPAbMAmFFyej0RhwNVutJXEH1LfGoipcXbtDCkgmyjfgpWB3Ml6JZdTKcIaMImZebeF1JZ5tcTISikNj0Y0E4Gs09qb7OsKzYP0NzCdMvgdXp+ZEiczep8Zcz5imF2cswsBxNKolVj6j6bmuwBWMQhzZEsShF/i0YP0CL+nz1aMAteAw/wDuq4hZOjauZ3tcAKZpk5NmvwkPdihmhMtOc3qm5vW+PYl7LoFJcDYurQL8BGRfngpWieNLCm8xIkfsT4ZPlQz4tR0+ZjjH2ANEEMF/rliLrTXb9URxMlYokWOXYiRZ4Exkp8K8xTQ6+G6nWdiPHLf3PsI2Fz6Uw35Nh3J4PVTkGPlYlMzWmWKYzmQyclw+5c18E3kRG3ncUg9vyoerLen6wAyoTXRcw+CYyaEF2dpXYADiiIpk5mxhx6cbmgj5XoYWx2/B15icf2FktUkhpuZRfAsLzXGQXHlJsSNtTDiqnWU9/oa648j9+efwBl/308Te0H4ByEGXjnwR+0s2gy0YiUHMfQGcaBh0z+/52Zxa9OqBr7yOw8B9+6sZ/iM+o2RcGvUTA26FU2pUsZN30eSuDTmWiY+ZoOihN39l/74HlA59goN1gHFooK5s+Z/lLjjO2WKDmcoJxMjNvJQNP6EYxohSKn1FzJEyl9nkpXNp4rR3Me4dSHV7x7Oj5wXaQMQiDbwfzT9ys3W0UX/97gC9xKyQsB1d+khk5w8DroVa92iUe8P/2kr+8cdH7X9iUoJ3Sx8MeBYlEXFJk3WERD000q8wiPSz+h8jbhAPgfouYg7HwoB0G0mhyKWYsgqaEzf0ZzT3eKM5oQD0I94Cx2FU2a/FPVoLxHxjYhCbVpneG7anBOAct0JKdFcSrQzx/mvtxMFtur3IAXunaFVqAMuTxvuo2tagulR6WmdlZKGASFrmMl7bJi3+PlhK5K1ZWTQvuRzs+Uvuo3PztTXtngc2pKjlqqUpkfmYCVzObDfnwaO2FyIY30fkYQIfk1qwe7pYtUhnrOpkN/iODb8uHql3tEiSkDczStXtzxKaqqTqbb28iI260h8GQn/O/3XglFYmuFiI+nkGP5YNV2v3JG+ucCQ/9ASaud0ulFSg5LLiaQI9mQz7HwEdRxJjleIpE+cksUuTf9vxQg4pk11Ji8xAm/DsfrNYW0pVLuo5lkx8DIZkLushrE2uPA3nkdX/OzXZ2o7UxMrH2pA8vO/FP3e/2TIHk+db+Dl8C8vsttgsPKTaEKCjFh/5B7B/sw042FUcm/d2n+PfYOlApXb4Y4jlw/zOXL3e96cYC/t8S8H0ijoRaO7QuebEZ/mvIg+8z862RVIeW0FcMkhMWv7l564ADdU6nglidv5kIFZ0fb5y24PG3xYdDihlhtEuxJFI5eciE5Ts0Xu9/gBjvsWVLfUx4Rdppxqaq6PrxIz86df99ZHTzH40cVUhM0gI8bsweg/m8w6vyo4eVTzhz+SpnkybrMFdtUTKMA0LLX+lj/COIzaz5BhXoERDu6k+XacmMmmMLBkkGTXMoldYSKsWgbWOhZiWDPhdeR8SF9BsLTJhNMGPnP/Tqpxu2FsT7xdFwbieAbQYlxaMboVAOs+dgYgxaSr7uXDBuA2MNvDgCC3rI2H0RVRwBefIlCWYcFmh8ThpUofFbUD8sxucpPsff8S6ex0PKt0c8PhzXMxpVATFQkpaxCcdjCZwIcGo9Ywq2oBY/clXvWDboNjlPZu/C1dD//ZYyRzggpeW4UWUg1u2iNrEQhfADrlKOly1qM3VGBFUoV+qZP5dUz8zFJHgUmVeM3CTNd0a/1sxXD3t06Fp4VCztPIoK9DSDbsyHqtxVPtbBKzfY2TCNw3ORSu04QtQWRnf36ww8kg/5XD9TbyJ7HGCKAjBLoCOdjMwESgoLjnxy99Wfb3hm2aHmhs+kgyLcEonvkEuVPL/ytx7mTWTkcjebGa/nwz5dh1ut52Fn/6x72EkNy7N6BYd07LZxFz1lJgrd8t070gqs4oTGgPmh/vifVCa7bmRmWUfvuqmIKhbnqshTeM0qTvSurKOSaw8y2HgBzGty4WptjplgRHLtmDI2Vq276DCzsP49m9smZ5GWK/glIHtVzC48pNiQlqcUH1oTrH7CLjzEbthxJpgI+F8Q461ujzlxnsZXwoaSwzJ+ycB1bmTKovGYVJH3u8l2BfE6v3R4qk0Dk1xNtwL+axg4hhl7/CO7/uHmF7KySf5cGjoApO0lX4R8IXff/p2Dy3Yp98jheSJAoXCq3ZHUd9oBwy988I0Pbvnmvnv/a9aEUe+HUmmnW6S8T2hy5e5r9t190AN/6Fg3bLdB5fd9smmrttUVq6tZRERhwDw6nFrl6INQtIx/kwl/i7SmZVG7oiiF7mDgyYjLKEogfBFxBxQPFJNwpO5zXXxGzVTDpGcYtCySapcxhhw+UnjKqGVng+3oK268eidNOaAZ38YW7Iu4eq0zLNt0sSB/HwUciUXOz0cPLBXFeBjw4y51aPeF5V4q3bAulOMw3A6tZT3ORxW61Vj1PTSrtmmdbj0jBMYg5cq6B0zlzOrMq5iOm/A0foKDsBKvuXI1ajEBd2IEjsBqXI7Virird0n+HvbCVlV0varxy9iGRvxDmY65q03kdUKQFf7H9SVHUVF8AMLbrl0mwUwMxh6KbPoSmnE8AEmEFqO2nbHwsFUKroWHN5n5iBgvZEO+koZRFYnOSwl0g/if5II+8b1xRtO/yr2D9nkXoDdzoSpXpU9FbM2BZHik6C+HaUzTFTPFgLRfi9HiFw/8LvLFX5obur/4VEZx9oVBLP1FVdnitcLcfg7mj8s2YKqDdNRC2eCj0L3xmWGnXfjOpw/eqktPlvH4jUO/Hd3b2HPUwVteeWzwptf/8XcUCo4j8MpEZhGDjwLRS7mg3tPDRmWy6wcsCc/Axi1m9zEfRMZo9xRvIrMGDDMX9ul+V/ju7tyj0G3ImTegm8r97wVHOspwFSyVUycBH2dDPuFhSQEnEG5JyYtqP9Cr8JBiQ2RSUnxoJUX9hF14SLu5D7msSGicaTCdGGxr19tMy2vra+th8n1sIBZxa9ufUXsCTNnQWYzHnGSbPYgF/I8RcKxp8PQ593do55bF8cL5BOlg0HPhVPv2Ur9eG7V0ZO7vWPft3QaXD3tm7fps5pON8oBLO10OU5kLywFzSM2Ioc+cdsCIa69/avWwuoNG5Dve3xh46z+fSlUus1cZS/Xc/hYce2zZ6D3/8xKDD57T1lFgafda79kHiUDt5Qy+lgnzIy5W8PGAXxG/wqm0+2baw2vZsoaAd0OptJCOtSgatMn6OZQMnKvLwCkSdKXNLvJa4RPJpiCHRb9mzl8DbGM98TiRzaYvovglGJfCwKloUgWAM6y0VVlvQ2DiaCxURYUeUeUhIrdCPV/Cek/ZZMuk04UmF2K4qF3yqsu4N7rhx+JeyozehUcjrse/EMZgDMGLeBobFQmzz3rGeLyD/XAxVqjOjNiGS1ElHZQ+6xlj8Td8hBNh4Dl8pEzXtDEACmJHbxE/7Y3PGdbnJMW7SIG1hn9FrxTp7KaKRZceFunUKGk6Jujr62ETOKWj454f89XDPpC1hYc3nmkn4qHZULUrT0PgTXSeChgPEJs3Z8PVkgGjhTeZWQ2mQi5U5TqGHNu0erfNgwbIxXQsDOOk/Gyvo6+Id2n2BBTMv6hnj/jn4r20Xfja9oXHOxXxzGmfP3Ln/cbgYd2fpX79eOHTD4Uf2Hc9A/fs/dM/3PbhL8+Sy5Dbet7d2/La+RiwS4SBoe82HJjjLRuEs9XHLM6byF4DmLLe1uWCVUeDyHH8baNySVe9aZqK7ErdhaNzc8dqn+mKROfTROTfurn7gPcbxmqdfr3xzIsqfoP5SDeli8Abz4gibly5WRi7NjJG9mo7r0h4K47Gcl8SMjqN24WHFBviWiaHR0l1QwnYH2yf7kks4L+GoJLvopFUWl8dq8N0/HEMQwqTh92Cz4q38peZ0RVpU74S2i9WYt7ljmKw8d1g2yta1m+ybkLAJFMUNk8x4dNIa3rHmXnPRh2r9+/z4edbZl7y1zcmhSd47469nBOlgLQIxQVWbsnyPjX7DR9U881990nK7/r75zKnV+428KbsJ5tlQcsD3qdYiNf5H2XCtL+9/cGV97Svky9c2MV92o2xM2oCZNL9IPp1uLVda4sbD/hVERh2yWnZHvGAX9bEbkM8B/rcRmHxgP8SBgKKT8JYFm5LO84uiwF1kjYs5j8HF0dBcjsXcyeR6P0vpFr/a9gyc+ne9L1RzMfZMHEvTFyBhSpu3BkWV0J4QaJymOVqmy5oVFktF8FEUCsHtRJcpSNTDULAtegRCPFTzIBMHOVQ9GwrPBqxCz7Hj3EPfDgAF+B1tTf0Wc84DKdjbyyCgXY8rEjpslHLrarveo5iJh7FMqxFN0y12cszKpy53WpBAAAgAElEQVQIZzWBlZcyGd04YIcCqTeEdMrqvyuqHH0hYyloukB4DU2KLKxHI54B48DiyMQdDXhKyZbXYxSW9xxKttvjzlh42NEYIpuXz6QXKhKZewg4vdxXtdfa48hVNluRzPtIZLOgP+ZCVa5mhxWJzAsE9uVC1SU5LxWJzJMEHEJM87PhKsdRWGXinVpG2eMw8DM2cZUBOn+HoLaewmNUMrMnf/TeM+sunjJwl29GLvnizwvl4O27noGqPc+//V5jj5GjPvxFvRDJteu5GKYmxfOIDc+2zl7f9EMZv4u9QC87Am8sMx8eFbhX4MKWafk54+QCo4U3tmYKGZ6nTOFKMk5xl/hmFwNmkOE5LB/yar23KhOZFQx8m4Gz3GS4gop45l4inEXonpINjZW9ZfvRqFAXHGXMXxIyMk3YhYcUG6KskOJDLIb/G9gHfy8zsqKZlzBjfx1OpV2r40R9TS3Y+CeDO8KptKthiQSfyTzaYKoNtrVrW0ixOv8NRBDm72Vu+SdLzqiZWjBJvDr+wIyRmg6K2qinV+8em3tolbD4X3j4jQ9GLu9YJ5upFCnSHRHGsPz98hCsO8s/6sOT9tv7hbf+88U5v3jyHbndC6NZWtPSyu91U4sFapMEnmECP5mTSku7U1QHfYylknW1NSaxSJ4ecHM6jQX8/yTmfcNtHf26gSUCNY8z0eHd3D1e47+hEK/ziyrjeiI8B8ZHbhwQxT8BpjHhjEhr2j4kxSVQbPa/nE/GVwdb7SXPRG87YSuZVQrrZSX5B414DKze56qSElcrJE7W5y/Q7GI8JhHzhIkSPtWP4DUhB54jCgWNhbdVeIzDnTheqWaG4jHcgtXqffuuZwMfYhqG4kB0YgnmYaNSiDiv5waMBylZnnh1yHuJykvatrIJ9w1Rs37XOWAcpTVIE1ifk8iLf4IWNcvXw+qeUMkORqMyMhOyb41r6JzAkkKfDcakHVKJbe8XKapLFy9fLWx5ZJ/nrSKxdg7BWMTA2f1UW3wA0FslxybxzCNEmM6bNo7ONx7g6KlhoyLeuZSITgIZ1+rULsq91PA8DlIS51nM/FA+XC3dhu2hCo9dj/nu1GFzbhAS9dD1ictbNzxxtxDj+65nYN2wmZdmdj31e7Uf3BqdteXffxZuk+N69sbXngIyxCDsEzb50lykWjqh0u3qtQcUjcTk0jAQpjE9F6ncsdjvBe/SbCUK/CyYd4HBF+WCehVNRXztj4mMm0oRf73xTuF9zWWin7rJcAXeZPYKcEGKuPO6tsmLZe+3O71yZu/4Of9fIGnCSbvwkI1VPjwpPrQy1X7CLjyOKN7IkKyrOUhCaCT1MFIifMziIRReBuizTzduPMjVwdMyvzrcYDos2NauJcWKxTkz30ykAuK2T5LshWLomhzwj4JxxObuAcc0PvSi08OiNurIId4tR1fvuZQIVeFUWh5qmfHKzVeqb1nYcsicNajMiG/qNgedf5gv//HmrfF72t+VhS8HgHRyZOFLcaM+t2TAf61pqRNuDqfSMieWL1/mllKVy1xSdT0SdQfuxVQuRdfrbqMTSc9lxje3gvZvcPHesBEL1CQN0LkMc7qOKyIodqT+ZoCaC+CDI6m0lgAlYXomKxvpWyKt6e3THGUDlE5H/30yvlrY3Cdp0feWJgsHgPEGWkrcoKPqVi+td5G4lvKVkI1ObmNJV2VKVBUEpxbD3ISjoUdUxQXIa37hogqxCg8R7R6IT8A4Dy2q09N3Pe+KudiCZmyGgeGYiw/UpUUKBMf1jKhSBAnpdfv1IZ+ZPBu9SW6W2kdGVxehBXf0/PuOmIfpUEFdaEGTiypHYMlmpZNbhWYXZ1xL3iySXekeud4M0YArQbimWMjteEDYEuz+KaG+WtjqRSEJ2zJ2VDT9awgNGv4fgO7NhXyu/DiBN9H1BsCeXMjnWsgpOa4ic/Kx+XC1di8ReOOZ60GIyprOhX3ODrYLFhjeMXPkUvQ4mTyGibfmQ9VOI3hVeAy//tEXBnj3H0FEd2aDVdLF6LuegbNo4JDFvHnDkF1OmPXLLx67Wzg6juu5GKT3BBE62eSluXC1PDfSEZREZxnLKFQsWXsImSoxfAvADSXzTZjJm8xImJ6PGbfkwz5tIW2RbvlRMP8uF/bJf9cRQro1YV5DjMW5cLX2dYKKJZkZZPIySdzNh0dvz+PYnkArZ5Ibcby/EGXMErvwkGJDZm9SfGhdM/sJkdPK+8pt5hlx5txt0JAsk/lOONUhxYgWy2YeOXhD4XMxINrTKDMnuoW0xer9cWKETKYT5rhwRSR4DSR/KP8xnOrQph4WQ9Kk6JBDpo6Ijwm1dsiD2gf77DJg6ftfbJl18n7Dnz7LP3KPq55487LO9Zul1SsPgbTlxQRMFvbmBcfvO2n4kIEHXffk6sOrhg361/O5T0T2KAtbCiAZYYiBi8jKfl/kldxARPeFWttl4UuVKlW5tEXl4JPvSLV04/X+d2S4EU6l+44AiojX+0U9cR5M46Twile0bTsbsUDtAgJfAfB8N0+RYsT9kwDfDdAsNj1HRla87Eh+TARqF4jTqoytQqn0ju6UUlSKcVj/fDK+etgjSCkqt1l0R9UNd3BJ46kGXKvSa60UU6cNchvOwwEoKCO/v7tmm1iqjCgIf0KTGlfoYZEp4zICQ4uL/8YQLMIGzMFUfIoaXIJm9ffJxtlnPeO7+JEinS7FamxVm7OsK8f1jKhyBd1QLM7k36VLIKMIuXVLZ2FbR8ciyUqB3YRm9d9yRgTDUYY1KgemGa6SwB6Jr/gTNbt0cuejQYmgLU8T91tdA+pAkDGtLqBOPgu5CMglwT0j5quHvZ7FeFE6jQreROYtEDaWyvUQeBMZVcjlBlftgzNJO4L1xjPXwsAVMDns5qkhsMiUfDXIWJELVurloMmuZWCWy1gOoBNzoSopJJygjAmHX/eXrvKqA1fkQ9WyTh3X896X/WGPAWP8N7932QnZwvp3F+rW86i78w96urvFKuEDInohG6ySA1q6+sLpEU6IUpztc897I8q3bnka4IEw+be5SLVj52Z7eBOZ+wCeQiBR0WjH5cr4rGxjHkRP5oJVWvqB5M8QSPyxHssF3TNgrFwb+ifAT+VC1TvaWkhX0jbBk71GeyZ8CfQqPKTYsNJTHQihXxJ24SGL4olYwP+aAR4cSnXYJBUt4gG/dEgmMsyjIqlVWsZ7PFD7U4BlUz/fze206CAqUtBnQ6m0KzM+Xlf7EMAfw0AdFTBTlza7795Dz/5kw5bEhxu2DNh3jyHdo4YNDD3TuV5a8rLY5YsSHokUFw8fXrkbb+k2j68Zseuq53Ifj3zrww0yNpEPXm6gUllLJap8U0ITK646buxe1xLweCilZK5ScMgc34YQHZWHR7yu9jkYvF+3YY6bp5HXFl1Of2UwLgi2pV3bbILYGbVnk8lLiOi3odZ2LYlIFWi7shiEiRRYOkkzIm0djgSwWH3NfGL6uRB0N+094DCH4D95sEXBszPeDgV2QS5t0m1dpQYlsdSmWCo0qtub3K5eRHOJOGnLulu6V++jeYcuwPZoQANIdQTSJd0+rbRbMe+TQqbvSMPGEJwCA634HAOxKzrxmZIiysHUZz1jIg7Gp9gPHlyPt9R+If/uuJ4xA2uxD/ZAs5qjy+3aUuhYxnrSUZBxkiUPFuMvQ633p9Gsbpd6RJVl+zo09TjeOqMRVyuDNHG81NnLC+bjKJiqy7kYzWp8o4cQVK2/7yG0qILGCZYSagBMhFWCbclsk68Q9nqWEWfP3uKNd/41F67WGh3a8CY6lwF0GmDU5kKV2gtqRaJrHoFbDOCqrpBPq0QUWIckFjP4mXyoWvucVCYztzHzCDCWC5+NC56p+TleJ87EPBhGE0zTGDThuLWbXnlCJKbSTe2znstH13SWDa/+wYBxhzzxyb3XSmdbu56H/6zt7YH7HvIxiD7Khny2IvA3xXyyHu8OZa8Oo4LAD7kVETa8yezNYHMmwE/mQtWuI1tvItMJxie5sL5AVPkzBq0Ec3su5HMVBYxIvr1PGZenGfgiH/SNA5Hy4NoO0iFX8QR7zrv5/cHTZ67Phaq1MSX9hFw+l9qFhxQb0jaTzcRV3toP2IXHt+MB/4/BfDhzWXVkxct6d0B1mNY8BKJvEXMg1NahJYrFA7WnEXgFg37jFhsfm+n3k6lkdu9u3jpggptXRzxQI61r8ZOQL1TrIGopTT58AkSvghEmwinbWZzL4pZDVP7OPW89+eATB3joziFlxorsZ5vHXPHom7rqXAoueThWMvBSJJV2Db9SFuvAqQbTIbrxUux0/8nkwR8ZuDWSSru22QSL6iZM85D5VDHpV7ehKoiZGgEZk3E8GbhVV/gVbdPlpuMxmI7Q/K524bEzEvEE9nMhB7i7P8b2mIeTYahb8TsYhsNws6P/xTZE1U1UOj7jtOOARpwMVu+ZxSYcgaSLbHYexiheBeFjbESNxn/DgmVFLhvUEjSrjddGr/WMObgFJs5AOc5Hi+IxaLk/aMDDyr3UAx/u7OVrIH+jdLe2EcDPx1B0q8/505IeHA3ogIFhaNIojGxYnZ771DikyWUUZZFORaooxZmrXBw/xi74VOUurUaTGiPrIAXUROV+sllFSOxMkL1dOqTyncp+1294k5nfyAiMTQTyEZ+WHO1NvHscsPVvEs6pGYP0oDLWdSwbLI7QL+dCvkN0io+KZNdVYD4BRtkPyez+O2CcnAtVyhrsA2888yMYdBFMzubWrp6+nZlZr/W8x4nRwqAzLswYg4c+nwtVy21eu569yYw8I7sSY9ettF4b6OZNdC5hokPIRHsuXFo2641nJCrkJwC/mgtV67uc6r0zzzFzdT5crc3IqlzSNY5NfoEJmz3lOKTruz49Mdv6fV8C0QFMnkn52V4nioWM9ZXJ357fb/rko9sa/xddafFFkdwdBSFSSdtYyY+K//Z/hSo8zp1Y8ddvjN3reBOeqZHUy9ruhSAeqLlDvC8A/oHu0BcUnTHfIqI/hVy4IksCB40qoEwq3IGGhyYHl7ev6fnhDogH/NeCcSRLy1/8Ldy9QmRW9wVAxzL4ykiqY8f5roJYsROz3OxENnRYoXvLsXMffEN4DH0Qq/cfSMBzzLS+4CkcoutgCOL1fnn4L2TS25wryarJUhj9OZxKi0+DK5bMHD+uUDCkxZ9244oI4oHaO0C8OzN2I9ArO0iMeyBheirbg/lTNoz54dZ2nZOlXaTujC6PAnkWRM4pvAvXjaEHVvCZ3O43FL063At5S8FxGEz4sRDO63QeamGo9q+kIU3FnS6xBjMxAHuoW5rcVCa7jhiiSioo4wpJZtVr9K3xjvAvhPC6PUenLyS5V35jwvFoUgWbOywX09Eow0G4w8UDpQHiuDgZW1DtanFudyWoH8FzUXWj+wDNVh6FK6Lqc5Txmms6KYbhc3yKXUD4ELzTyWltlcKXGgNVJjovZNBvDcJPuoI+rXPxvotzVZs85utgfixXIubdMrTyPAfwei4vO1Qb5pbMzgcXLtzKg04tp80riPn32XC142VH+XoYuB2ML1w6IgrSPWDgs3zIJ9w5LSqTXQtNk/cnYH8udB+TnzvW6YCWLo+IF2YQ+P1ssOoYwLmIsiGdHgNoZuZ8OZtHro2M0a5pb6JrGcCnbjbMfT+cPdrRlHNEct0uZbz13wwea4COyoaqFL9SB2+8836ATgXxGblQte6i3zNqGTBu4plb3n55uf2D/wJSkIl6SsHeYKX4cN78+g91mFxwRDUme3drCKXaZW6mRazefxkxrjQZv57TltbfTqwi4X0C3gml0iKVckRT9NDygR9ukZn8QcSYHmpLCznIEfE6//dAmE+E1Qxk3Zw8i3yJCpIKkKg11Nru6Me/+PSaKsNDTzLwVwJOZeo+LtL6muP46u5z/Hts3aTm+rsVuukI1/yZ+trzwPx7g3BlsDdBswfFTJlOBq+JlFADCZaeNG5Y9+DBQg7cvLY2PW6B5HlqEK+vvQLM31ReCCb2DLelHR39ivLmlSB8CpPuDbe1/6Lnh32hHk6PQf8pmLyzKQAE9kYtYzd3PoFAZLPlEMnwKHGudZCt9kYjliiLccI0NCkSW19Yslkp3H39ks1aB7R00E5xDTSLqk6AqJD+5qrKkZGRid+AsBTN6vV6RJXO/0aYaFRU2lKIKpKfuPxOdf2sohDp/SyYmIKFqmWug9AT5QAT0zH9eEkQVYqlPdG8nfukDlZxeCjKsL9rcSRGcvehDp+oYtrddO7rgX2Q9Ftx401kTwXMB5lxez7sbAcuGPcnHrjxgy65Ib9VKiDOMrSiV8A8jD2FI/KznQ/zymRXgJlbCHQciK8W87FssMpREWlH3AsHjgqFo7NzxjjGWggqE5kXTKAyH/K5fj/Kit26cBwKGN/QdVkq450/YCIZbTM8NC13bqUriX9ULDPd8OBJUQKy4TlK021Q8MYz14FwORueGfnZXkdTSoE30fV4kScyawdpcR9UxruuZoMvBIwFOvWQwBi6+6fm5x/bXCD5TvXPaP8hqrl77cJDig3hYEjx4UgS/BJQhUegZuSfUh3rnFw5e5AM+M8xFWGF7w6nOlyJcsIVIWBgOJV2JfTFArWPEfFUBr6r6woIiqMAsfr9M4MHuo0YYgH/z4jxDQY+NYA3Qm1pRyMv+bvjgZqnmOlNIoQMNo4Ntr3ibP5kFVKyiU4ssHHMXJfXJev8x5gqHZQWhlPtDT0/2AGxQM2bBCoPp9LupktFWLkuqCoD+d3SZuN1/ghI2vDGvYB5wtra9DSnIsUm6BKwxQStjqTatQfakjPGB2ffvypR/D9lw9rZkjwFNqtbOAklnV6LCoopkvhbskCIQuybpWM0F82wP4e+iCq2/KGy+SjapRsa0QxWD/bFaIa+4LfIlDeC8DyaXLgqUfU3i8T0UbS45LQIrNfKKOhmNPfDaCiqDJkuRAFzsAj39Pz7jthmce6kIOmNRrwJVrJZd68a6zM9EusxAst7ey/0QQMSIJwLwhFoUjwrZzTgThDmYTE+QrcyxZM2t5qP70SQ30kO2365qlbGVvvZKH+BgD9lS1qcd64FaHMu5HMfl1mv/TfI8HN34RhtdHyycxoxPcHgk4jp2yCMyYV8jl1uKxmWngV4FzZxrusoKN75AIhO5PKyal2XRaCKCaF8kyEjlku1niLxtfUgz0IG7wqY03Oh0c4XiCKKKbbPsYwdiY/NB6u1+36R/3IfE/88H6zWZXlJgSTqoRkE+nk2VKW1ihBUJtbOM2H8moBWNwWTqGLe/dGRtxQ+7DkWhIZg8bf+OwiH7D678LBvdlqb8y8Bu30uh452o7DcRllIiQ+FU2lt6qAgHqiVam5SOJV2nUsm6mvjbHIdG3xppFUfEBcLjD+MYFhpn6D91n6057ELVq50zMFI1vsbTMaPGfSSAWwJuRym8Xr/PWAiwDwR5DpikMP8TyCcQOCzQ6kObYUqChIQvwzip0OtytPDEfFAjWQr+Asec6zbuMZGPOCXz/44k+goXeidID6j5psw6AGDcLUpCZ0mTw+v6HD0OEjU1z4E5iEMHrq2tuNIp+JEoMZLjPZwKi3ELIEc8O4t7K8H9g1RWoxnuv4K1q38TDAa+3FASl6LFBu/dLXujir5mmy2Lf2Q4sphL4XMbSXe8xTFFZFclwocqc1/OQ9TUFCOqSKFLUXk3E8RXgkPoEltLO6YhyAMNIFxK1qUcZkzGlR6r3yW/Ym4fxqMg9GibvL6NrclRQ7DxHTXLovAks0uAKEBTRBjQGdEVb6HKFyuQbNKGpY1Izt26W7KVwu78Cg52iwSD98GjH/nQlVaqbzAm+h6mcAjssEq6QbrP3vrtVKQfwOgulyo0rHFXxnr2k+4H8TmpWwYuwI0vxvlR70XHNmHWzE6tmbQVqPsWcD0gujnuaBPu+97Y523wKAL2OBv52dXOxLiBd5455kgIT8b6xhYqkub9cayU2AINw6fgfm8XFipZ7SoXNY12NzA/yLCWDbxXbcCqSKWP5CM7lfkWXXji1QkOn9OoAuYeVG+hHtsVTLzLZOFNEsv5EJVWrFF5dKuk7jAf3r3+xM/NT/7yLY5+F/QMAS9Cg/bKEQ2f62EtZ+wCw+t/EYZXxn8ApheDFt5HVrEA3554GcNIJ58jkbeKojX+a8mAxeYTL+LpNq1DmuLTptU4SnrllHIMwZh2ham43T+FkJkBfMSBtqIMCLskleSqKu5ySTUEqgSjDvDLkqSWL1/EambKf0gnGp3/IwEi047YFdP2YC3wXgv3KaPuC8m8tYT8aE6CfD2iAX84pU/i8BnuRU98foJ48HmkzD4BjbpOjLplPCKduE79EE8ULsQxKPFcdJgPjLY1uHogLts5vihGwueNSZ4dSSVtkl6Uvj2q0vzFcPueIgRkONoSaERlyqvDMJVaCphZnUeDkUBz4Fwn2t0u/hvCKVRxjxunh4C64BuAuERNEFrJIf5mAQhXMuhWMDhWKTURH0h5FRD3e43oBwTXfNfwhiEAapjVXq8IZiH42Hgb5ANsMWlixRVxY58TvegyUUKLLBks/XoxgQsdvEhiqoi55cwMQ8LnfemHszDGTCUGubXrh2cKL4HVt0jexQlIxY51GVPLank+4oh+5x0YYQnoE8GXvBEmXfMvnmAs7lQtWvR6U12PSYCgnJz0H5rI/vox1ByoMUzC9kQIzs+Lxeqduzy9UTMMy1h5g4yqI1AU7OhKsd9rTKeaWPCZAYtzIeqtIZ7FYm15xOM20H8w1xQL3EtjmxWMtEzZPKLOq+M6iVrR201jb+TeIwybs+FfKJwcYU3npEQz8OI6MfZYJV2/Y2Ordl9q1H2NsBv50I+La2gMtbZwAbdBKLHcsEqbcdeMHLpuwd7zG4xevyEyz0Tdd2eyliXnw3+FwGPZEM+UaHZXi1CatXasn8JyAXuD3bhYW+wUnxoCTn9hF14yEMo5LVeWDxz0nCj0P0aM96LtKXlD9MiHvDLze1aA0YwmHpFe4uMBWolU+V6wHwgnOpw3aQSAf9KsVcXIhCbOFaTIIvEzAmHc8GU8cY9IJ5Y2LrlOB1BNF5X8wNIQBvhE2I8HUqltbcz8bVg8I8N0C+CqXadoZNCPOB/DeDdeNjnYyPxtY4Wxok6/y+ZcAkbNCtyf7s4w7oiXj/hKrB5mYxOwq3O9uaCZTMP3W1DYctTxLiHSQ4+vllH/I0HakU2ejTAB5qMuXPa0loDpkTAn2bwXuFUh2yAdkdEKmmtH8nXCLsgl7Xn3OmyotMfBGOha8S8YA4qUKZIiv/ewVCrNxogN66FYLSXNCibh2Nh4HEw/o0WZQPtjHkYAUPxGgyYOEJLZLWUHnLTGgUDh6NJKW70iKrvbmtJRYrAIn6K2uZtNCsljTMuwHBsxmpxBEaTSs3Vw5LN/kyNmJxdWS3Mw+kwFKfkV2hWLox6SIHGeB6sSLf6DT2qovRuh4En0dQzipJiTjqz8vm6joW/Btj7vOsYyJvskovA5lywyvU79SYz9wJ0hunxTHl3VoXjPmqjeDO/hIivzQarHTlqgopk5hGAXi7rNlsKHnqGiL6fDVbJCK8PKuOZ21j8YAz8MRf0ab1fRsXfOdqgssfBZnMuPFr7uopF7xxAZWWisukA0fpcyKft3nkTnY8x0Ugy8VddcbI9KhJdLQSuI9CvsqEqGTNq4U1kxIp+cC5UpVVvVSa7TmY22xiUzod8+udeiExL3xo22Bz0IhhjCJAizpF4WnVvpsLcglUgvJUL+oQjKEW8PLMC4XqIzP6/hVyMxPlVwW4py6J0vP1/CdiFh6PTWTzgl42qrFQcvQqIYxbm7S916glB8XVLAfpHONWulawKEgH/3SbxIIPpmww+O5zqeLjnh9shOXO8zywYUnTIiOcbJuE4XdpqrK4mQER3geg5MOfDqbTWCyBWVzOHiG4jcCyU6pCWrBaxgF+4EpPZ9NTozLks7gW1WMm9+i6PjcV1tSEP4U4TZixS4r+fCPgfloPPJJ5EoBfCqbS0k/sgFqi9iMDye5gMxCOt7WK444h4oOZBEH3b7DYnznlglRzAtgGRkG/tBb4zwR5Byhilr7GRFTzWDsJj2x08elgqCpGN6r0dokqqKS6PORg4DHeptrgzrBGHbCKbUIZJrsRHy/RsdMkwuQb8HYQji4m0WmM+hQbVkRiL9RiJ5T3fpTNmYxcMxqsglKMbNdpui0A+J8J6NLl4mgi2pc3KiEO//q0OjhRQD6G55MhMRhHSrXsdzSrvwxnzcSoKaC3mv0xS6RoW5HIiviWiZnLnmnz1sNezdgxUkcysIsZuuZDPlXPlTWRE3fJDGMbZudmV+oLPOqRDAN0lnLps2Kcl8HvjnQmQBMn55ngTGUmwfkA75kh2/hRM32fG8/mwT2y45fMXn6BtwYTiv7Hs/aEDNm6SVNyncqEq7TOqwukGlq2EYeTAvFvup3XfQv5FKRz72ABUJjMLYeJINvi1XLBaX5ha6+AAbyIjUviLiLC4lLeHTRL1FLgmM6fa8czxxtZMhMcj3JiPjXJMLi2b7XoUbB7OBkXzQZ/j5VTGQLyRXxcb1Vyo2u7U2VEqApEiu47R+gn5vJbbhYfdgpPFpiy5/wvYv9xFRde3HigyJWMMl5kHR5av0m6SktXCTNLqdc0gSdZNmGZS4UkCvTF848ZJJ7vYq8soBESyQYxm5ht0t3dRxQz6cMtKk/AWMc40iI4LajgQiRnjD2ePcEX4YbAidUqhJV+sfJbSoRAmsLT/Zi6uq5luEMmNSzgtrkStWMAvOueziTFNp8pRmTIFdSNY6sY7sZGY4T+JDWWKIzJbreudIFHvbwbTIAarwyScSvc9dK3f8xySGyRzBxO96uYZEqv330BihU00azvui71WpLL+b41p/n/AJl3LWulNfj5WaRxyYOTR0i85pqiXRmIgqumnf24AACAASURBVPF75djaF+djJLqVakOstqeiWTmmOuOHGIz/x9yXgEdVne+/352wKrgrZLKg4komqLgLAu57zUSsVshMgExwq9VWW1ur1Fpta61bqyYRMhNcQRKsdd+XqnVDk+BSqZBJJrjvCkLmfv/nPTMTCbnnDlb/P3ifp09bwWSWc8/5zve9y1fmZ+4AxYFo8ImYn44n8SwmoAOvYKXJSvE+9GNZm2i6rdZZwulyqMEiiDFG80+FzSFTpFAWzGKq32bei5iRCm+Nep9RAJFxemUBtQD1Jv/BG5lUXhZv/0E9fHNFzIUpZlxR06jz6cBl+C+c7VOWus8675/PPbOYWOj4dnQ3AHiQcaTJ19uPU5VNJt0hVVI8ApPFm/vDDkJi2TkOAldB9bdZ23AriuZ1HqWukstxt40cShQlOv6swJhUpPTYYKKzCapfpaIlnh3E4LyuKrjuNd+8+tgHH1478z4Ybw/TQePa7qPmCyaSXYB8kIoU+z6jmUwZdaGyKwqciampRSxi6NHUp/gNxpMXwZEIVD8e8tk3By/96U7ez3IGWzrDt1pceP3izRW4PxUpIfHbCkp3FYioq9aAuAz3ZiDPxu0cwUGdVSV2wnPm/d8EaAUg16YiJdYgy2Ci8zWIlmrP6tBaYXY5p1trmvH/AK6Bu3KFR450xIfdUyf8HZA7TKj86J17JSpDD6piQrpH9vSTjWY9OF5X4G0/SWjWtps68B51C/axdQWIRGX5OUofQdFVArkn0txq/QLo1aFwehzosVA91WZmRq5IwYAeElQXQ1HiDv9iUnV8Oeeh/NlUH5Cpz9c/7JbwmM974JB1/Xy0ud13Dh6vKLsMIr+CutOjLUs8rYazXh1tqnjJLyMlh/iJoXEZHwhZEm1u9Z3ZJsJll6gxy3Joo0tCryevheRgcfUBhdxFe2C/YiqrivkbIDeuY/rGzY0mS6ys7V2ADYdc4cHvs28nix0EwbC8ZlYEk2EV+0Kwu+8hHTNkx7FQ/BgNxtjLDobEsbBVVKEBVhJzlv9wCu7Ek/jMKF28FSSZRFy+x0tQD+sIzqDWBHSdBcExqDM25/7IRNeTz3FMHokv3xM7PjujPs8+FDO8k3bU5zF2y0Tc51e6EDFTvO0IB7taO02ZLtO/oNjaEFTnmO7U2sh1fFkU+h52GwA5A7F+/BOODgDZd+DqntHL/CLWEx3HAfIPqNaloqWehUEOhfO69xJ3zfMi8nxXVQkl3p6g6ZcITv1myOBJg75eeT5E9u+KlHgS6QsTHYeJOPevfOXhzz654Yy3dPUq7n85R2QqtHrXYzCR5Hewdd7uTTzZqNCgiEwQyMTsKIIHLs+w3gtHUaJjKo0rke5x37tg4u09H3ZaL1rEsBPP/bn79Wd/3uInl/yrK1pqff9EYaLzfGGZrHpxKmr3SqGRGBRjFTi5O1riu0ewSBLBma7i3u5oiVU1GmxKUi5+MNz0Qanq7dcmXOeyqn7ILC2eEwtzhQcfcpJHWHxYOxHrAf683Ny+N82uMRyiReoprqMHT7+r3VM+RTw+aVJBx5Yfse3uRJrbRpmodQ/UTRm32aCe1S9DUKqQCdXNrVZ2ejYV9+90xxORtyLNbcyR8ES8IvQ3FTMH2x2KS6MtbVYme7wixJAq3nj2VDcwOVv4cLzEmxDJS7S0PuuvR455YMtNnBdb3/vis7/+azn9//nPSTyl7In20Dxweft4adTmQ+6cfchoLtArbKON+VPGDPw67fDm8lW0uc13BktkfEWcVwD9RnTN2EjLm1ai4Nxw+UwHej5Um0RkiusGJnk5zrIj5ao8LtAWQPZyvpQJVQ+19mOcE6bTEsDdqniiurltXVvmXFYLxwC+Rj4bCLnCg0z5bzfZmMkb2TevmRWR6SIwIG8/3GTMsrwRMzwSKk4u8g1IIzImXewEUu1hLxIywWc/g4vTcbPx7eChzoOHJEt257jGTkLM3EIux2o0IW58Q9h1IE+Bzx+9DLheqXA5BWE8iU9wKT7HHLxs9g0mJ5OoxueKMs3jAfOauBdcasoojm32xOloMt81jav4+fGQp0SQz9DbqMFJeAlT0YXr8YExbLNvqjVgtggj8vzHc98GxI1Afe/h5I2Mgytlm/tYR1GnYwukTaFRCEGthxU7VVq5Vv8LiGFT1G9UXY+cE28f/klRItmsimMQcPZLTSvyfu+GK2FyPdiB5e3dV4mYSVt1W0WwoqvKkBQ9kT3Mr3AUk1zR8YBc1COrD3qvanS/ws+YjsGhG/Wg7pqdP9DVq2j26JXMPG6zKb9sxIAhO3/1YMMxPR+lWOyzE00nVcbZcyzHImW7ETe+tvKzup9XDRw9bpOVrz58/+qlr/BSTAdfchS5p/G5LB6024FnFWw36oLNTvud+8EfwvPWLG/jJZ1rnp8ls6hy65rd8ZMGjZ1cIlJw5dCDwt3D9z5qp+XV23ty9Iii+PLTVJwGCO5MVZV4dpeJYCLJ9XYEoL9KRUr78SfXRrCpKwp1rwL0zVSk1KpgCcY7qOz8kcA9rSs6at0LDPcBdnyM70tRPLmkK2r/LtcTfQqPHBP7+zJX1y48yMu4Il5ZdiVUfgFXfhJd1OrbvmVWiwC7uW4g5NfBiIfLnoHIuHxeHXTQ1IypzP0QrIoubLOSheIV5QxHO9bMoIEF0eY2a1hUvCJEa9xtBHqQIzq5amF7rt3F2zxVDVx8UwcVOCfWnTDmrOWfrBzyx2feuXvVGpfFBrkVvFnydbFaZ1eoLVEReuPldz//17jC4bdGFrZZW8dZ749Romt29isiCAb0DR8yhByEIODsF1342trx3X3QWFF+lDh6FwsuVvqO6iQvZUrjlDEjJO08DsjjED2lwHHHT12wxJOA2Dhljz2ctPusC/f9TQLDdjt5wXPreibw/7OFR324VbWzAZErPFgIZDgxMfN98bZProRvmzMrhyWZLYx6WNepkW06ZjRZjzrz3NhRiwuh5iZGi3P7javW/N5roaY4YT4F+UwcZ9GSnyoNjgAvw49wH7YzRfADqAedbknkY2FDsyRuwjyguPkuwilw8Sma8TZexn8NkZWXC27qvEyQMEjZHy8BHGnsiGFYiB9hZ9BNssm4eJJ0zfXFA4MFG0nIE3EC/orNcQYW4B2sNIUCu0ieku1sMbEb6vMYYNWCceiVUITQkCf4MvM9nY40TsQcM470Ri0ehWs+w6vR4KleYtR8hoC3FT4zv73+u1mT/39GjizIi0vvKKkokXzQ1YKruqOF1m7UiMZlo5xA4DVRvOGntCDGzF8y8NOVm/4HkIIBbrrM5spZ2NhxuDi4V52CSYp0wEnT7dg5yCtC3hAk04NYrJauevWh2o+unkneFZ/Nde0fRg4sGfPvbS69r/DzBX8844t7b+R6575MGS/XK91seaC+MnDnva/Z5jfNwz/8S9WoQbvt0/j5/Cv5XOXWPM8q/v0PZdDQu0de++KuH10zY7utf3XbzFR0ByZqM++Gf4dd6bXXdVHBZlsftd21r0Tev/jorYaf8NPQR3+rtboHZz4DeQAiz6eq7BJXY2amNLvU67sipXY+U/ZnOo7cq2oC7fbtihR70ieKEp3XqLrTBbioK1rKC8S6YMdoLBsTwUTnG1B3XCpa+n1t080ekys8WGzQUIbFR79K8zuABJQcyezixnD5Fw70rxD5pc3pM4fGitAiEZzgKiZPb2njoeyJxsrQfCiOgOqvqlvsXh1Zgih/zqtQbB5tabOGaiUqy6aryq8V6BDRV6IL260EoMaK0BUimKhMJlQ5sbqlNdfa4wHKgoK8Ft6OR08pG3nysbtsPfz0u19/aWVPmg81HxJu7LwVsXql8cuQbYYM3D+2b9FPtxs2+OWf/vN16yiGEfdQHAtx9o0sfM1+e86C3h6AHAhHjoje5S2DJRp/FAo5BXjSdfFnEVzmqhzhlfg7fwoCX/Ww06NtdMhzBD+pWtjmaZSVLVA4CitCQPaNLvBUD/FGQRUFNwIu8I0NucKDN/4MKY7ppAEsxk15jPZi5tZEO/5z0GAOdm/EjEyX6/ghXwUFUYsqKK6H4hlfQ6+YmXU/CEUDGswtj21WjthYjLDrxsPwtxiExYiYnsSLaOjNH+Gmz4OFmyCLEzo3vomDMR274jHMx9f41HA7eAhwLXPD4mfBn8sbE5+z2SjFXzAc52F/LESDKUoYQc7Pkesgx/GYj93xEcZnA/UajDKGPCjvC0oNbjPurQUoww0+VvQxc6v9DdI4GXOMB4sdMVPw8ZLxG9TDvkfFzGviZ0SC6jm9/7wv+Llm+DMjoTjOFD3WYn8DIEcW/E7EV0M8/FqXmgTbSElOXmlFsCn5sqiOdtLY00aQLLqlM6Rpmg3KTFdWvyw64GkV98LuqlGeo8DsKGgvBX7eHSlh8cn9j0qLPl3xwaGDHx20+/hDNj121umpqpJch41dGn5ndB/m+qsYvPeRswePPbxikwknv/nuLw4sTn/YxXHM2muenS3+//MG73XE+YNDEwcM2uWAuvd+fQifaxbivCDwzFx3Xb+03Z+eGO5ssnnxuz8/aKl+85WVIB2c1zUWafdZCD6WNTK2a2axJ/eqMJGkapOdR/JkfKX1pivkynMQGQY441ORIk+OYLApyffBQiueqirhs+sFcsz2dIZt9eXIvy0ejAJnn9RpRSxGvg84cm3JFR4sNngj4QfJdun/Cs7rDSlpl603mX/hwTuwHXxt1Id0SMQry6+Fao1Ca235J0RjRdmfRWS6QK+PNLdbNds8IL9Ol5P0yY7Ajm6gYPL0BYs931fipNDR6oI3/SeZehltbrO6uTG2HqKMcB4uggsiC9t5k8yBmzGrYH7Rmw8MOB/86uAdsP0Wgw6sbjYOnWxR8SHhQUs1Dw+bF7fdZOCLO2w59PnxpVu8/5dnlvWZu66NRGXoKtDAC3qyn/dGDvGKsjshchwUsWhLm6frHnHzlDFbFrBAM6mPqHGAX1Y1t3k+/JmsGudTsq4h8vfowlY+dJ5IhEP/UtWdAefn0ZZWT65KNjCMs8ONcR5O5FQA3xYe6wPKLDNKGFt0ega1Rj1CFcli1JtOhB21OBSKB42KQrGXdXSQU3AIHkGdGXsQ/P7ZceEhzJHCORiLUViFB3CAuXSUZ0dGnGvzdsjWMblK5FwsQwA3YIZJRl6WvcGzQGChzZ/HAog3QI5y2PZeilrsjkfRit3xOv5hOln8PDjGZQGSW/9lmIDRWIpmHG88MHj4s1vA8Wb/S0KtKeIugospuNlwRrxRg2kQ4zY6G3XmFmpHRgpNDhcN2ux28DFTOLI1TzM1K0Eye3HLjKo3QSu+2uiK6RxZkB2gvGPaHIKJJMcvwXR6wG7vTh/puY/mUJhIPihQGhMeuMJCfCRBcgAGPq4u/paKltxYFE8+pdD7bURV4/8hcgJErk5VFeX+DosoFu25C1jZyLnLgp/eeOb9Qw+suP2ja2vY2eCYkwUHn10eorx83TGyMfmHT+vOfnKTw6IvwE13fHj5SVx3a695kitZWPx8UNnBzw8//uyhA3fb7x+pqhI+G1y7vNDy2eLtfe11LYGtCt8f8dfnh3545dRrv2l/ipdwdkP6jaHpA9LjOnQwHalasP+KqLccuXBe6gRx09zL2RHp/1ysha3nfDBs8ICVz6urQRWp7Y6UrDsKNChMdJwtED4bj/kRfrOJ6OMKthuF7f7yTCQ1rci2j38X9Ck8OKMlk57tS9/2fR4U5Ig+x+2yTXpK2Yj5kYXemR45JCpDlET9EZDrfGWzmZj3X6vqouqWdi4SK+IVoTtVlEFme0GcybYRQ6Jy7J6qLtNmufDd6oVtVkMjYyYGTajgPajcVN3curYJDVusvO2x23F/vDI0L/FKauqpY4PHxBa1MeeDM2/yGcj/YGHCuTaLsbq/Hbv7S7e3rRhVO7F4m6p5Fp5EuHymQm9g2zza0ua/mfK1VpZfCVdjEL002txuJSoR8YoQDzMe/JMBvdP29+OV5TfCVd4ethLBs35eJfFw+e2A8raQsHFViAJHvu5xlYcWNwX/g3fDIFd4sBVvzanog5g5NDnrbUI9rEWsUbCsMVLc9HpIYXlLpSpkDdLYx+rBcTYG4RujtPnvWh0M/rsky3HzZaH8lOmILMdSLMfW2BqH4dneMDd2R3ggcYPmfsBLQAQH4s8ow0rUm+4PN1mObcjJYTFDngd/F5U/r6IMl+BAPI1F2AInYni2QOK/x44BxxNs+76CAjyCI7EPupHEYjNH5oiDhwo7X30l2TMxFY7JtbkEDT7FRA32MN4f62M6ljFTI1HvYd/uUQ0uhpif9RFW42DEjWrFG8fhAvzTWMET7ATaf+6GQY4syNY/C5C8KIonH1TRSeL27N1VvaOvZXYwkWSxXaWKo2yqDILR8fQ76oqWXsJEV0C+SkVKPAs/JtOK6tmA3JqKFLM7lQNl0byxk/i96eDQIYu3+kX8/i8fji/57JaLyX/gpYZrk50LFhMMrZtcsG3pxO2ufPrU9y46cpPhJ577+sfXx3iYrrvmyb37ybaz7/lozYr/Rr5+4vaeb976N7kXfO54SX8iq87gJbt3XRcmkmd/MPu4UwObbZNY9eqj/Kw5suF67UtfmK+B4Nedzyl0V3EwI1VV6tmVy3JqnoWio8cZuKeXc+vaCDZ1/hOu7qki11hlyPGOKgX+JiIcmeX2CE84w7f8r/v5xzs4m237ofvZ+2xM/BAgN2hRrvBgsWEOFavUbv3QS66atP2Wy55Y9rGvgQ49MCBymwPcE/GRzSYqy6aqCm/Xz0X7ExT7gAmuorqPQsaro5Or72rnIukHjgLQ47DV9zZEh5d+vNWhky226fPC5XuloU9BleSse6Mt7VZL6qxs9Oeff9Pz05/e+8baHQEesGtzHALxcIhjmoO+XLVmj7Pue9NzDt14Utkkx5XHFLgt2txmd7rMoilc/jNX3d9BpCna3OZ7WGZdYdmF2QqQt9dRnPSiMRy61AEOUkpHRVdFm9uteTHxcIhFFnMDnvaT+c45seyIc+5948Ev15jJHKt9XxOcDYScgdj6FR6zMAqu6TbQ1yPXbfBGLV6BoiwvV2Q6hqHAfD47wcXBuNlwHLwRM7wIN6+CowbPmN/7NY7ELaZIyoGbLgtPFuqZjkrMbNxlcLEzbu7dQNdey7zpcYTDzfco0zvZ33RDytdR8FBiyr1BcTyGYhu8gzQ+RMIUMBzR8t/hxYVdw29xOsqRNp/PHb5hdjOwJQJ4B4rFaPDomKyNWQjCNYcwOzh2lVctZhiODLlraYz3TRqOYTw+xxO4w3R9ifXL9/m/RY4suF4qssJEBwPaZij0iO5IKQ9vKwwHQeQCN+2esaK61IvwaVCUSN7GzCsWGsGm5O8Vsnd3VbGncq6oqZO/+ypRebQrUux1M+c65IGYLEwkV9BptTtSys4c11K/AjFjrx54EiIfuN98tV1gs00O7jq5mIVL3zUPSOFNS6IydPifRfW9T56ed+hXN/9m7eKBazknozXrujDReblAf6arvvhld+0YdkgJnq/9zpRgU+ddUD1QoNd2RUo9zcS2ve297Qas+WYxoEPEcfbpmlZsX3vmZyZvBORoUb2nK+Id5leU6KxQKAul9we46X2XV29vvewEb+k69IOLj3tk9TtmssKOl93w77uBBeDducIj57bH4oO38f8V/BJyXzgfWOtttzFcvr+QKa/6arSlzXrozKsoOzwtwq7Bm9uuXDnOz6sj2xWJQnWEAzmjqqXNs5IkjCrFMZtn0UpXDju9pdWT29JUUb4tiw4RfK7AK9XNbZ6VOZEIjzlD4ZDQd3k0f9Iubcsjos7BtiC5xsrddoIWMAdhcbS53d/BMvOeMtbZwKP58m8aw2V/cOCMc1XfFVGxOb42hsvYlosJq3yRUZGFrdYDtTFc9muB1AKa9JMNZxN83zr9niWBlWtczmHJF7BKpzcgeHDSaCl/4ZHx1eBt/g3Um9mwHTVmrHU8BD9GnTmg7CChkVJcRQ0aDDPfGzHjtDkKQYyAJSPHIMOT4IE4E/V9pLUcs7IzwoM4c/moNQFx3PD39fEU4WWD8+dbcCjmYGvshWE4yDcHJWYOvmEoRInva2Xa70Ash+JVNPg4vRIx051ahfo8fjCzUYBuU0Bw7xttHVnNwpFwTUdnIBSHoMG0171RjW1QgGX4AK9gUa9tPMdB1svUBgIPEI6+8nqMBONdF0LcSwXuuV2RUVz/VhTN64qp694AOJenIkXWTmgw3nG1iGzfFSk5sSjROVPh/hwIkIfQr8ue8f9w/wHI4nw388JEsl1ENk1VFVtH1QTt1V1HBovq7j3iTnqvahQ7CH3XPDsNTI+lG63g87SjB747tdSTPJ9DMNFRC5VrTSGRJy8l2JS8AarHAPKArctDBBOdVCLu4TqYuGKa4bRYEUwkec7yMsjPynPfL4wnjxAx4YirXNXxK6KlnqMdIttpeeb9i45Mr+l8g938H/Ji2KfwYLFBtiqLD08G8nqClWbuJmQtPLLEz8UQfKnpwFgvySYxp2LM2IDjUDP/VQ969p3Z/Ma6DOZeNFaMOUXE4W37Syiu8ctKiYdDtwBaCMjO6YAcOmOB3VckEQ49rMBmAnT4dmUyBl33KnRudZ6k3XhFiO3biwUyK9Lc6pkimom4X80uyOpocxsZ6J7S4hziJ5UdIa5zn+Yp5Ih4RehMCGfa+jTEKY5aionGivJTAOVIKS4ODvvKcSeduWCJp21udhx0mUDWpNPugdPvbve03s9ltSjcd6LN7TzUOSPdWAuPnLFefo5HzMyF6Urqu6Fn01bZWfol6s3PtSMTaHaiyQLxVlFkUIt7oJiMIdgR1/qo0mrwe4iZef8O9eaWtzZ4aeDzy8J+VTY99udQTPUteHJgxm6AXjk4BXWGdOqNWjwFxR7owa6Ya/yD7KjBcqrR8hYTGf+NUViNYt9RCBEzm+gOcBHCzRaX5lmmw8PNfg0U56LBcGTsiGEFBCtQZ9xtc+Q7jrWs6rQNBL42jrLY7bGSHpm4quKQxH9dPjtw46sBedi4claVWEfghfGOC0QkPMBNT+oJFByiqncqAgd3R4L9SPJZ4imVge/JGhlnI10SwUTyYUqgU4OLt8LJYnXPDSaSfNb4bB4AuJOyKbJ91zxf59ylxU5gILkXW7mCE1ZUlfCwtqKosfModfBPEfeOrqpS3450UbzjdypSxc55Klpq7dwXJZKLlLJZ1Wje4Dl2hVy9QkXfXzNkyP4fnLxtv/25cN7yA8V1sh0rPTkVKfX0piJK5nbskA44z0NdNzVzdBI9a9hB+iELD541/8gVHjmSHzX8fVud3w1sfeVs0Ckt6lf9Zr062NYaKersHWl5zXvEkFFFsBod4YhMsLmHEo0nlU8QV5+EymsquNvPPpwOpiq8PckYhRzq5wGS6UrIWFX9LNLSdojNV6RxSigkabwM0QeiC9tZ0VnRVFF+istAKehV0eY2a3Ucrwy9BBc7OQVuqGrBErvplBlFGa4KW+IfDhw0cK+f3P6yZwAQ0VgZ4kE2R4DbBNjLHf7FoV45MDQIU1cfosoFipmBgDtx2oIlnu0+w38RvU0UQ/06OERjOPRfLrpsMZUbZWyshQc7GNTr+xceNWa8Mgz13jbUvchYfMehmIuGrDzXhkzi6dlZvsLas+2+iJkO1ww4OAw3mdmzNzg2cA13Yl7eTJmYUcHcCBeX4WbD8vdHLX4BNc87zcesMnTjaSKogGBfX08TIldMDEKR1emViBkVzNFIGxt2z/XZi5jhXVCxsL+1g5Px6iDnZRMo6tDQy9nwRsx0DzZBveECcZPmnkX0d7vd8DAqBT/5+oi5HbsHAvIqIPekvMcbvRjZ1L2boz2LIfpoqqrUymcJNnZMgyOXsctQkC7YTBz3SYWe5nUAFs3v3FJX6mt8nlQC+3VPC1ovhYWJJPexaQHVA5I+N/hgPPkbOAizI0gVTVek2ErODyY6aLS4k4j8yi/IjTDW5Q7PKHkyFSkhL8SKwnjyTBFcqMDqntU9B7xvMWmjFb2YdSMXd0WKrfETRFGi82iFNit0tRvAAV6dmaJEZ7kajov2iOglXVX2Mdioxk82X+N8wXOW7/+ArirDE2EH74fk4NE1+55c4cFig9IkFh+eQWjrCc57cwQYkmr6jRvi4RBblhMcnwNKAWmqDL2gijIVf6+OuZWhHRzFkyIk1enLfhko2VyR05WEQUG42iIFJeLhEDdSyht73EDBITZVzG0nlG23ukD4cLwRbW6jRboVTZVle7sqzwv0rkhzu9U+N1FZvhCqFQp3QrR5ybrOiH2QmDI2iHT6RUCGicoBVS2tOaliPyROHLuvBtwnRUFr3sPSPQWHzvjH4n63TtNpEucxhVwv0IvVkYnVd7V6tvsyIzPlgfcp/SX8FDSN9GkRjO5x3NEzFyzhLSZnaLSxFh65jgcPd++2aMx4WOyCTzASC/rmRPRBJoOF0rmHUWcUEnbUYDrEdCT+hXrzoHojI9llYcjeiHVD6Q2yI+m13kgK7ajFwUbhpWhCQx6CJlFrNvQ7TEGVke56owZXQUwBdQrq80hcM3bs/IzGoN7i50FkPFV+Bgcn4CajTrEj0z3i53qsr9tqDBzrMtOG35PVbNAgZsYv7CCUot5c3jhiy+1p/sXqhgEPZ44VPGf2Gf+NYSkRLOvKhIRZEUx0bQW4NHJbmg0U80Qw3nUoxL1fHXdSWgcvLdA1T4q6V3dFS8mt6IfCRPJFAca5LiauqLaPGILxZRdCApdDUJ2qKiGp1RPBpiRH77MBWQ3F1VTR9P7hOgg2JRtp1SDQhnxeGds0Lhsx0Am8DkhHPjv2YLzjZIjUQTEcBc5Bqan9fUqIjGxW/wg4c9ch0vaDkeK65rI5WBE4qjsS7MfBKY4nd3Qp0xf0qMit3VXFdmK26cgkn1JBSBw5q2taMfdxWiqQL/X/J/E51wAAIABJREFUrfDIBRt93wQ6/oxc4cKbUp8vL5tBchJEfrJWXkc/xMOhuyGYoK7+2s+rgwZZw4YMedIRpEl89M91CU1xBTcqxBXVc/0OyEQ4VKtmTKROIOBMnmYZxZgCKRxKchQUaWnzbQezQNC0+wYgr0WbW638B3IvBPILOJgevcv+Ggnmygz6aDXzb8oclcOqPLw3crglXF7UA9MVegiiFRDnUC+1T9YK/jFVaQb0dEedGVUtr3m2zuMnlu0IR2g09RVUbom2tHLW74l4ZaiFzgbquvtUL1qSa0fn5H0/ZCvvh0QuPNH79poZcRyCAdgdf+9nZPQtMsmwfK8rUJ/HobUGR0JwDwRv4WOMsxYzGf+PW0BFWIOP6Vit8engLeYt1OeRd2ZC7+h78++8BE2iBgdC8DQUj6DByMm9MQtnwcU1EPwWdUa5YkeN+Xs88I9HvVHPeKMGs4wNv+A3qMvTlajFRVBcbIzX/D1VWJzwPb2FOuOwaEeGK8OLyTjUmw4Cwec6pxBiUUTVxcYEFvh8zjwLj6KmjiWqzqapSHG/HJd1EUx0LofomlRViZXInO2ePCkqs7qixQuDTZ2PirpP2w71oqZkiyqOFpGf2BJpieJ5yRNcF4sU+ufuSCldeD2R5TXcraqvO4J7bL+XKEx0XiLQWhG5r6uquP+zvjZUJdiUXMb2d/eyd0Zj9uR+BNIcgnOXH4IC5xG4eF8cOa+rqtjTqqAwnjxBBPOh+lAqWurbNR8xd8U2gcCa56C6tTjOGV4/M0tOfQiQNET/naryzr3JIZjoWECTSQXmdEeKc11OKpPYyfkhCw92xv6ZKzxYbJBEwsLBV7KTB+yYsPIn+hQecyvKLnNEzsv4X5gwNU9kVRGnKeQGv5EJ0VhZvlBUCwX4pqq5bbJtFBIPjzkIcBgm1wXRv/j//rJjAZmv0ICjMtkW0kbEw6F2AbbcZuXK7f1IrzobTqI1xIPpaz+b87nhsh8HIE0QXB1Z2GZ9oHKIh0Ocbx6grsysbmm1zuFnz4YzqrXsSUDYij5NHTnUq4NhCpkP1zAW+gUVDTuCSyML22ly1g+3nDZ6eM+qIY/xM3ddLK5uabPedvmdCnCW6zg/rr6rTxGTmzmz7W5XF2w45MilVHv0VVTEjPnbNDg43HfEQbAdz2yPgdgNf/eRq89AGQJGbr0KLva1ymZrsTfUdFr8lR5nYiv0oN08FYNQbszIbTgbw7Eab0HxKerXQ2o5HTugwHxvHaj3btsb1OIoqBlx1Pt6ZRB0W1VjSPbrPCMbEq3JFeHIyv+QYIFGXw8X16PBmJx5g7LZzPf5Mb7BRF+uSC0uh+JXEJy6jm06O565SAh6QrAjtTGBN2S6yvYz7CtKJB9Q6IGyxhnlx6kggolOfu+Fq7/8fMcPzhzjeVHNtO2/fFKBhu5I8d+Cic55Cndld6TUc58INiWvNgRqF79IVZdYL5sjb32n1OkpYIrqPalIqTVpuLgpWea6hiD6BhOkU1UlVF55IpueezUgr6Yixb4J50Qw0bEYKiU9zurdvKzdcyhq7AxpgDlN7ke8o9pC2grnLt9LCmgFL0tSkeK8+2AwkXwCqrvy0pGqLl3b1sFgm78v2XTgpps+BHFUVD8gmbf3Dz0QbOqsg+ohgDyfihSvzUti94+dxx9yf2bH9d5c4UFeBvkZHJWsa2v9XUCOSI4oyhk1CaaUeM5wRf8GxU1+ZmKJcNnZCpkNaEs0D0GzMRy6TkQniEqBqBxaZVOlMFAtrTx0Vyl0XnVzG0consiOGPhwDnAEFTZXTsKMjAR7BLRn12nNb/gGWsUryxfDdYsKVq3acer9Sz05NGYM4rjPqeKe6ha7n0gO8XCIB18FVC+JtrR72d32gr4mECNZPFIU0yItbZ5King4xNnn+wrs5wiaIgvbekP+1kUiXP4AoMNU8WW0pc16220Ml7N9eLUL/H56c5tZD2uB83DOxT1vYBsBcj4ePFy+HY3FzK39l3AQwU2mKLGjxtwaJkKw91o34/7IcAvY+SmFYgIaeg+wvsh0TziiegH1hq9gR0ayuxsC2A83msPGjpghHG6LAHbBjXmUbRkFD5UpgxDA7ta/HzMExpcgeCivvLjGfEZPQNCAOp+RTUayzE7ds6g3tzE7ZmICqE6gwqTe+D54g6ZjDv5iUmUCOAg3Gktxb5yOCNKm6LwU9f34Lxw55LholyBmuCT+o63/W+Ra533IpcF48gaTywtngs3pModgU/IhpiG7a3rGrJi5g7XLV5hIPiDAy6lIyW+Kmjr/pHDHpKpKPceGhv8A/FlFruuOFNsN9zKH7vuALk1FSq1JwyW3dmyRTsuT4uITFXk/FSm2dsKL48mDXTHxAMtkjeybt+jKvP/x6qb36q7e3mqFPqrx/RFrnJX0iPpaFM/aJK6me+GsaTOCbTjlXgqftRFMdDQBwuIowc+29w/WQjCefAiODICrm8jHMrHrvGLrmV6Y6PyjUOWm+CS1rOggzJa1VWYcX7JDwQvinkzw7Y6WeEqfvwP6FB58YWT3sviwV/r58a1lcCYP4spEZegwpeOi4s5oi91MbG5F2XGOIwug+ly0ud236mysKD9fRLk5DVXBodUL2zwXQDZQ7UlV87rurW5ps7Y+bzt+3NZrBq7mwb+NiJ61jitpHyQqQ/NV8SNHZZwfp4KIh0OsGieJOmN9ibQ9zusqSFY3t+U9gOMVIW54Z8PRG6IL7Z4iRLaDxPY+K+SLbcF3icpQvevqMIiMdICn/A3CQrdAUKIuttWCggk2/ovJfxG911W5ZXpLqxdfIHcD82XZb0DkLNNZkGVa7xkH0Ueg+DUa8owNYibjhTb6R/umshKZDJK9IJjmqwqJGd7JJ6jP83llSJfHwcFxuMnI6OyoxUNwMREBjINfZH0OlO5yTbGYqjMjpP7IFEh8Lt9GfR6pNCPuXXOregZ1xu7dG7MxEN2mGOT791cPTccupiOjeAkNsCeDzsJBcA0vg2XHRF+flNOxfzYk7lZLp4m3wgzJMYQl2B87wcEk1Jku1sYAclt4SeB3Zj6/rILlLgXO7I6U+IYTBpuSCShOQyA9PjW1T4ppHzDtlf+dipZUFyU6z1G4kW96Vk78cMau/fiDmRGD3iWQu7oiJdbzgQgmOt6EYkAqWtqbM+OFYKLzPoWyg4/uZcWT1zlMe1HY1F0i2sPva4i4ckBXdbH9YpD5/TQ7+4n26MTuGaWe/ESD2Y8XFO2w42PqYgAE3X7uoMYVVrCTA+zbWVXi++wVxjv+JCJTFXpfd6TU00upMJ5sEVHape9UIOlJHVWjvLum5u92XiCiNRBsLmk5sKu6mBeatUFuJeW5rcFEksaEh0DcyVlF0P8KFi735QoPFhtrS4v+V9AHJFexnTN3yphHnLSzWKGPVze3Wwl1c380Zncn4NAkqHNoYNM9PMLEesFxhAMhcWtT19FD/NJujcW3SggiT0ebW/N1UJ7IpNLqZX4dhMaK0FUiOE8FFX6kV6KxIlQvgpoeVw6bucgnK6Uy9KYoNi8YMnTnqbf+27MjkgNt213o5aK4J9piD5MjGivLz3dUT4ViqCv69+rmds/5diJc/geF7qOCrx1F0i/Bt7Gi7BoGD7ECTotOmPFtQF4fZLtHLziCZ6sWWnNyeNOgP0PvRriRgcRGmuCRa5C5rdEOXFCGm4wdsx0xQyy8GoJfos7M++1gMi2TPQQX+Upsa8BNahvUG6WNHRkpLH//OaiHp1y7FznSJdNJG/IUKESmoDkBiiPRYBwhvUFfDd7i6r4NI/NEptNDDtW7viMbImY6YyOwEjtgns9I+GfYHF/hPxB84FugTEchCox7KUfMp/vKhjNW9DyYXkK91VOEr5+vkboZF3vhaNyQp+D8vwUJxuw89RqIjWpcNmKNDBiXihbZ+TSZooMk5t+4AZm2Ymqx9VJGIzEFxnVHSo4KNnVNgZu+XgMFE73UKcVNyb1dxXMC0xGY2PsHHihKJJ9QoDwVKeEZY0V2bDAW0M0GuO5kP5OswkTHKwIpcwTHd+aRzZrOAPSCrMTV1zq8MJFsFgjt82XzIZ9PWnLyGE+eVrCp459Q5yhVPcbP6ZUIxpPnQoTjvRdTVcWenaNsYTQC0IMBzUmGPVGUWD5T4VD8sbm46Sld1dt7Ea7JwwwXbFv6xXZXPj3YcXFopw/hdz3Rp/BgsUEjJ+PClv1n/wtouW5uv8MHDTj3umN3vUQARtFb0wwbo6MGO18M48GzeRrYe/rCNmubM5M2K08baZDqSZGWdiuT3YxiTFtHX402t/uGb8XDZQlVOdIRvdEvAyYRHlurcG+U9Qi9mxsuu9CB/F7g/jTSvMR6kzA8DeBgTWPv6rvbfCvuRLj8JIWy1fZ8tLnVtyuUNRP7kyo+FtHbo83tnrfzRGX5OUqrJlffEJEeP7fReDh0EcnBag5jmRptbvWMLr/1J6Et1qzi5iafR5tb/aLL+bDzhrveFs7/x2CHiuQ5HrD+bf21kVOG5BsbEDX4HQRnQXEDGrx9bwxqcT8UB8PFLlb/CaIW1VCYsSYa8pAbZ+ECuEYGez7qDbfCHxniZy1c1OJmk8rpjZgho5ViAHb25bQQMVN0DMMn2BELfMa8GSnsIQhgLG40/44dMfO98ca7E+p75f39UYPHeduE4K++xeE0bIIh5md+iXrfjBMe5hnC9vaoxzLT7dqYQDUR90J+fr5k+LVROK9zpqjWQ91LUpFR1lF1NsysNvCVTkpvGtgTcB+BOoemIkW8YPRB8ZxkoVtgCrn3UpESXxfV7IF6cjqte747vb9kNIdgPHmRCE5RxUiRnsldkR2s48VgU8ddgLAbf153pMSTx5ZDYdPyM0Wd6yDOxamqIiuBnsgWPuWAjnQL0hNXnOY9jipMdFwnIjOhenoqUsosLysK48lTRZTKuqVDPlt9wNKf7tSvOWCcS1V3MkF6DqZ3TyuxXoqNg6loI6DvqnK8Ze108XI1ZUDRLtj2socOS0VLrZfn7wA2IO7PFR5076NdMV0IrQzd9QDdD40+ObJH8JPJO2zJ0DXfRZWV1453HZ3g173IqkLY3hsKlXN9gscYkPYLiJwrijcjLW2H9v6BB7IqkpkQuSO6sNWWOol5J5VPSLv6uAI3+7mXEtkCYb4oro74jHfi4bIbAKkB9MRoc7vvjcP8fnJVHLyx7dcr9/Ijs9JmXVx5VEVaBe69tnFMYzj0EwGuhOojEGwRbbZ7kDRWlM0SEY7PBviNbIh4OMRbX4kEnLLIgtc8I5mJLYcOeOHjr41BDTd1vw19Q4Hvg7dYttfzOscaxIwvCW+Uz6DeR+lBxIyfxhVQ/BMNsJsPZbw6aoxJmJ+DZi5Ijjkh9cYh0I5ZOC7rzHkT6tdD9hkDE5tZJF2FOp8CKSNHnQzBXtYxTA4Z6/Y9EEC5L68iM7KiiuVI1PWxeO+PGjwHMV2OsnUs2/si0+lh0bsA9cbQzY5Mp4Xqpl1Qb3KtvHE8GnEPcumh/G/fA2UDgJ0KhqeRZG5Vo6yNEXOWTw4UOA8rZG53pNhaRGdVGY2OYGJaCgaK9jwC1VgqUuoZ6BdMJJcqsImzRsb48SqKEh2zVeRiBX7SXVVi7UgF53VVwXV5udoO6hyZihZZD0lj7871BFyTipRYCymiqKnzGFX9J1TrUtFSf2UIu0K80TMKIeBMtMpm53WeJa7+mbyi1LQS60ibCCaWTwYcvpduTa8+oHv66H7GjMF48i8iTO51RwKBa1KRIu4Xnihq6pyoikdV8KyovpiKlFjPp8Hlk1esan18hAzZtEtXfunvUbT+4J5I/o8Biw1mDLD4sLq/rQd60xlnjCv6aM7LXeyAWJGoCM1RwdR88lrCpJ0COyjkT+sEtPVBvLLsZKjczGAd1cAEmysqkU2bvYwS00hzq9VXo/HEPTZ3nHQnBE9FFrZZjXIIRsxLwMx57/aT98Yry0+H6jUquKR6YRuDt6yYM6V8FyeNfwt0lZvWfWyuoESiYuzOKi4Pp25Vfbq6pd1TDz63MnRYQHG/UrGhGD20wD3s5AVLPLtd8crySrjaIIJ3FTrHFiRHxMMhdqGOVshBfuZscyvKD7nxheUPv5j6nKRXjjTyxm1vAJAoyLHS+snJZsNBN/1k8D4a8khXM/4XlEv/26d1z0OPxd7lcHEObvYdw1AKy9e5FPV5iLoxw0Xge3vQ1yckh4x0l14Jjaj3ucXHjOyYY5vDfccwBM3EMrfvg1Hf633RHzU4j507wxmrN2GLdtRiERTHwsX+uDnLtfBCDS6E4GwonkCDeW921OABCA6Fk8f0LIZf4XNcsdaw5sfZG+PGhMz3kwk7883RIrZpXDJioAz7L0QeS0WKreRgo8oIOE+JKyeJ6Nuu6CMizmU2A66sSVe5FMieXaf14xX0orApeYoxOnT19wyU6/2DdRBMdE2GKEcVn6qrP+2OljCPxBPBpuQsuCbosIUclN4/8EAw0bUz4LYK5L6uSLGvvDrY2EE/mVmAbC0iMZsc2BQy0LuhensqUmrtLhMm4l4dXsYHqVMwvntaIZ/vPjCFGeQwEbiu6qPdkVJrx74k3jEmLQ67T/9W1Z7uaAnTdT0RbEo+/En9eZO+fuYu1gTrXaiuB/oUHiw2eACw+PAk4qwnRmQTAREIYEo6bY+vTlSEzlMHf4A6F0WbX7MeZATTXqFyiEDn+JEes2ZWz4jIu27aGV+96FUS0TyROCn0I80YH70QbW7znS/Gw2XdgLB74yspqjt+560HDRi0VKHt1T7ZKt86reLWfDyNv08Zs+kmaYc3rpEuZPz05tZ+iy8H2pGTTCsQUbiv2JRBicqyclXjv3E3FHs7MB4gnqqguRWhiY7gMRPdrvKQb4JwZfm19P5QV0+pbmn3fPCIxsrQMQLcc91zHR+90v05Q57YjvTNWdhA+G4clJhpszOR1f92kPG/oN/Df7ESe1n5CjWG9/EPCK7zdS+dgiHY3MgGydHiTd9+K2cqbo95P5TB+hofGWTSdqmGWIh6Uyh4I2bMAn9rxkZ1sMohDTJmYjz4q33tyDN5KRyx1KHeBNHZ8W1X5EeoM0m33qjFSXTuNSORekNstiPTaaqGiym42SdTJ1OY3Yr3cBPu7pUMs+Nkfx0bBvyMeGtnJ2h9vDreE9EOPzOxEfNXbBNYufppgfMXhbQA6UcgckuqqsRzTzcBaa7xEWJGi5WDELy1aw/0uP8G5M5UpNh6QBfd3DlaC9xn4DirjDFZpNTq9hmMdx0rkm5WOM+lIsX2Yj8bMT+oYGVSgfbuSInVd4komtd5mrp6JRRfqIPruqtKPC8IwXnvjIUboJfKU6lIqa8izShzeoQk7lJx5YSu6uJ+HIyiRMc5CpkpwH+VJFYfyfB2Te9uOwCrH1fVJYAzukc+nvBe1dj++878+YHCVQfcK67u8+HlJ73+zX9e4Dn2Q+7P7DI+mCs8cv4Xuf//v4Kkt1xrnZ0BTzlqY0XZ4WKC37TRL+mU4CgEkBkiuCu6sM3aEqbxlVPQ84oAQwPqTpjWsiRD8vJAY3jMPgIjm136cWDTcef5kFkT4VCbC2xW3dzGFrov4uFQhyhW+pmJZUZG6TcE0h5pbvPf+MzvL/uXQg4QwRGRhW2+t8hEOHSvKoohsiTa3Hpq7x+shawV/eOA0up3sqhzmE1tE68cOwbqss3HNnhbtLnNetuNV4ZiGW6B/M7PSMyol0S4iXfX3v36g9+k08x34JphK3tjQ05Olr8jEzOH8ziksT3m+CQ8xwzZMmerzfA1b2fOGozJdjAeQL1hltuRSZDdx4TJNfRmhXgjhrdJNsamGI2rfTgVRCazhHLYf6EO9pFlLaYa51KaZtWbDo0dGa8Odi6uQH1fg8E+oKeJwxgCPJpXkprpYPw+axBmPXhQgz0gptPzbtYnxdO22qAGvzA/M58NfMZThQfo7agHpaA5/g05Qb7P6wYAiwF6mdCtmI68VgQTnW9BtCBVVeJLDg7GO9jdeKZrSNHvg6s6+X6fSVWVeI7igomOa6ByNlRPSVWX2t1rGRu/qvMjOlGnIqXWdTdmvg78dGUnyY5bQnCH7fcSGetwk/+SWj1k8B5emSZrI5hIdjEqozta6nvhGNmUPNJR/YdAFivwqFXimnF6pU9Odypa4k+i5uttStKnZqyKc1aqqqifZJ/x9hC5HBDylIakqortl4LZs53g9tOZcN4twFHpgI73slcffZ8OWvVBJ3l7O7mqC7qjpWxGcAyZd718B/C5eIiFBv/DLgeLD/6i7wO+uNyDxyqxXwv15hPGjC4oCLQq9LnqZn/+BR1EIbhCVR/LRxBtDIdeFSCkrh5avajdaujEAiVQ0MPNOT1oYMG4U+/obxmeQ2NF6BER7D004G5rG0PkEA+HeEgEhwbcYr+/m6gMva2KQUMDu25/8oIFvmOtuRWhOx0HJ4hqNNLcvrZRUT80VoTiItgPKkujLd6hb4RJ5RUm0soxSDuHRxa9ljsE+4CpvK7oY1B8DMF7fmOjbKfpWYHeEmlut95OEieFjtbMDVZFcVCkpY2tPnIHeACwW7axgZ85/R+4pu1djJghWp6S9+A/A5uixxQT20Mx0erVQeOvNUaVsQx1eRxdY+bAp0lWpe9Nn8hJdtMYmzfXhHJYwZtw8F/f11CLA6BMmcadeccWMVPEsct2q68deybingTIVN6x0SycAtd0Ta725Wr8ApvgcyMV5vs6AHVZ9YkXYpgCNXwI5tp4dg0NMt8ni+YXs54qvR3frH269/e74UADKxZHHIcznNET2VHIzqllc7fF7NnWDjgtxtla7YqUzKDrKBRdNr+KYFPXz6AuuyK/6Y4U+zrNBhOdSUA/S0VKfCXjwUTnAsDdAyoPp6L22362e0Ci6SaOYp/OaIl3sZ9FMNHxOmAcXH0vm4Xzuvdy3DWPq2IJRFrzpM3+B9ChMkR26jrZ7qtBBBPJOyByKKB/9OocFTZ2HC+O3EG3aIi7e2pIyST/gLzOBRAKMnAMxD21q2pUv4ZAxi5/+H1QdyuI/CcVKeGokGMbThjYDSeN4odAb+HBYoMvmguMo5bvA27OOUIXZ9x9WMXGQbMtlFQXX1b7dAWI7CFFW9yXqpvbfWPGE5Xl97iqRzrQH0ea260BQEQ8HGKlV+Ko7O/nwcGAOBKxApD9p/mMN4isV8fBBZBdpja3WhUHjeHQowLs7wSkrGpBq1VfTTRWhv4oChqqnV/d3GpjHRskKsv+rJCTROU/Vc2tR9scXBPh0K0KGQbosXD16OiidquEK1OgcG1I2k9BYwoUR99WF69Vt7RZ/RKaKsce6arLBf+hAudWN7fR5pfted56qXzw5QNtIDBPgh05KrVInO6PmMkk4k3rtHVi5vsjQ6ZkxH0YDT7ZIuxKCAZhJEb5xsZn+A/sLl2Ielh5TwaU7IJ8KkxEXa+ttzcyXBU+x1/5qjgyElM6o76Q12K9BvtATFbNU77dE6IW9GsYnlfpkuk2kEdEgqhnh68XtXjUqIIEx+fJamFrmbdN2sDbPUWImGlBf7GWDX6vqi/r6WHnhGwY8BDhYWJdz0YKKjhqQDq9+/Lq7a2j6mBT8vei2LcrUnJkMNERhzhOqsp7JFLY1HG8QFhw3piKlFiztAjjawFslYqU+HZAg03Jv6riRAFeSEVKrPw8Ipv/sgdcZ0Kq2pvwmUMw0fEvQHbTVQVF3bWFVkVU1gOEXc53VWR5d1WxlRweTCSfUSAkAWdMamqR9Xwg+L6gcpqqG++OlvYLES1s6hgvKo8IpF6hRzo9mNw5o8R6eQ42JW8QRaELjBbF3z2zalSlsKnzfkCGCHTwiFXF41+uFQpO6J5Nwi47uFv1/v3vBxboD7PwIHmEv4QEU6pavg/WLjw4E+ojJUqEQy8COmpIYNDokxe8nLNW74ebK8rLCsSMArrSPd+Mm/GPt/oZz+QQD4euB3SmKs6sbvG2984hHi57DCITqQ6INrdZN99EOPRbBS5VaFV1c3u/NtfaSITLGxSo1jQmV9/d34Y8h3hl2Y1QqVVHD6m+y96RIbIR89eLyvWRllbf1jW9OkT1PED+8/nKr4/4qUXtEg+X/wVw94NIubqYWd3SZm11NobL7wC0WIBNRdccEml50yqJjIdDHMOko81tVvJR1rKeypm3ObONLuwdxZBRzbh3roXNs/9sY0Ku4qe3Cl15+2ImYnBQB8ElqDMFiB01WAAxYW1noM5Hilprugcs2hmQZldl1OAwiCE+xlHncysnMkm3v0UaZ2BOHl8PImZUOTz4t7dmxdC99Essg+DDvPkzM1CKAF4j4Tsv6TZm7OepdCq3jqGIM1CMNXgDDv6dt5DJ8D8icHAmbjIdIm9kxmAsFjp9/T+IWtC/Joi6Pp0DruGciyvl4Z7GhhsQ7AjRBoCvsZ8fRlGi4zqFnClwj+uKjOJlyhNF8Y4YHDlH1aFfxG8hukOqqsRTRZUhNMorKrivu8pOZiToCiqK/QZ/Vrzt0p+K5z5GZLsnFwDyRipS7PvdF8ZNIXU8IyC6q0p9O4LBRNfdgHt4oEDLkqeVWlVWhXXdQ2Uwiw51AfkgFSmxjkIzGSjyI7jOvqnqIns3lH833nEhxDkXovenqkr6dQQL56V2gZt+QgS3G36Um56cqt7e+jML4x0Xi9DlVF0R5+muqmJPgm4w0XmPqhZQGSMFGL8W4ZfdK8rsf8j9md/XIyw8WGxwc2HxQS+P7wO2pnLFBhd2r5WyMfOCHO+o7lHV0s6NzRO3HD16eM+QIUsAGdyDNXvPbH7DUwdNNFaWnQOVPwF6RbWP/wYRrwjNAzXegil+xl+NJ4WmOC7uVOAP0eY268yQiFeW/0ZUf5+GxKY3t1o3dDMyAv6mgguiC9t8mfnkv0DkAVGdH21p973FNYZDlOxdI4ql6fTqybYCrbEydJ64IE9ma1U531eKTIKoqweJYDsTR+1QAAAgAElEQVRXAodUL3zVyjpPhMufVtUxBUNXjpp6q8UKPkNkZYVL+Vz7OjwR/m8SETlvZUDhxgZ2O9j1oMEeXX2/RW5skPHq8JXZZVNUWRyQL2D//mMgG//HtGS2jmGIXKchY2blS4zGLFTANf4N1/iOInKowb+Nt0UAO1qt0AkWJ+xKfOpTnBAkvm5hDmDBSuxmJdISmZHVtLxdmbMxCN+Yfea9vMF3Gcky29V/8rA4/xYZG3hm6mwCRciX/5ExUTsCX6AUt/ch8q4dktnv4rURIPe88TUyV6sXwUSS3I+rVPWc7mip1dOlcF7H4eLKIkVgvGgPeQZlmw/54lgvk6wsr2EpoG/4WZwTwUTSjAxdwYErqko8TQmJonhnpYrGRaSjIN0zfnn19lbVYlGi80qFnpV1ZfW9lBYmOhsEWo2AHpma6u9XEYx3/BMi2wDyZaqqiPu1Z1eSEffk1IgjJ3VNK/ZVbRY1dc6A6l9dwbPdVf1tyQvrXhrqDN72KYU8Ywj8iuP9TMeKEp28vJ4vwBuqWJGKeofEZczOoFAcpUDFOj+TCigSsX/I/bm38GCxweqSC4cGYt8HZErn2nO90tx4uPxyQC9UdSqrLUmnOSQqQy+qokzEOTCy8DVrq7KpcsyRrjr3qWq8uqWdBEUr4hVll0HkfNfVn01f1N6/1ZTFrZWhHVYrXneAhZHmNurdrcg6qN4ByBV+So+myrK9XRWSmhLR5jZ+kVY0VZTt5jrkAMjzUbvbp0FTZegYV7FIBW+nHXdCNma+Hxoryk8RURLu1kBwaXRhm2ccNZEIl/9aoVTZlCrkED85bCJc1qSQU5wBOrbqTu9CkkRapN0nXEUSDr6oXtgvg4afMWfpbKczJ2hjg3HZ69cNzGSQkJ3+T1+lBxEzSat/yBp6kc/ijYwq5DcQzPTtiBB0BeWzVZ/HFTTzOikrvRf18L1tGjBXRnAgCrAbbjDJvN7IxMHvCRe7+5qZETHDeRmV5ZXYD+Ja/M7Y0Atmoc5sdnZkRjFDUJ9HmZFR5LDTdjvqfHxSiJgZ2ewFB/vlkc2SaPpzpHEs5vQb2bA4zbXnOcrwjBLYgMg9b3yNxlKcKGxKHS+aXgTBtamqEmuQXlHjf3dSp+AZgTNLoeMBGTtkm1XHLj2mv6EVEYwnk3Dk61RVse9YvSjROVtFLxaVqq6I3RV1ZLxjnCNCn5aPA4FBByZP287alShq7KhRR+jUfJWN8JlDMJE041IHmNGZp0AhryXjjOqsGbRq9RHv1O7o2bkvSnSepdDrVORX3VXFdnKy6UwYDxReDjg28lTQ0ArdEXysIkeIuhd2RUqtn1NwXhdH6ber6r0iGGizbC9KJOeoMG9LdndUr+uKlq57NpDnQYH4D7k/c2xPyoGR4PEH97/VfXewPcmbWC9RNX5i+alw9Daoc0m05TXfdnRjZWiRKH4EVw6L+luM7yqKVxV4vLq5rV91uDbiFaFqCOpVcFV1nsTXeEXZB4zEjvpIYYnsLZ5V+fxoc5t1Q7v12NAWawaZdnRrdKGd/0BkOz3sLnwQbW7zbV1nVTkk7nZpwD2oesEST1vgDOkTnC92OSbxttXK+M9+TlQQbRtQ9+hpLe1Wo6bGcOi3wpAsB1Ojd7V5yiFnA86oihBDv7gpbbrtypWTPEzP2J6lwoX/nOtwY0POifJb4vUFGIZPzWH7MurNQ2RHrelexCFoQZ0P8bIWx0ONB8VffYsTIkMQJSt+V9T3Ehn7I4bNIGZUsdyXHJpDxlfjRyjAeNxgiipvxMxGVJnX14KIGbOviXBxgK+vxiycBteYbV2ZVYbYkXn/TPHdwbcjkxvFUAZeb4judmTeO4Oy/Lk3DJMTNJlk2gbjLbIuct1j9m1+jSE4E/UblVqr3/NW1Ni5kzraCtV/pqKlVgI5HteCYLKTe858KAohupcMcY61ESWDTZ2viup2260qLsnyBTwRbOqaBmhC1b202ye2vujmzi11AF6Futs6BTKhc2qJdY0aXw+4jypwe3ekxPcCWdTUWaOq9SJySVdVse/5VJRI0mzxGBURgRzeFSn2NEcsbkoe6WYSmW/Kx2kpnLv8QCkIPAl121JDSvbxIokWNnVe60BLVLUUkFtSkRKry25hIrWnIP0UjLRZt0+VFE/GZOlnCsr3oua8lrTCbe+OlHo9d/T44XhqdTCevBKiNalI6fclmRp5PguPXJX+Q1Q1+wHm5sAPr6CxcredRAtYiCzwO6CJREXZNSpyJlw9Lbqo3Wq8U3f8uKGDBnzToRAGqvmaOmW5Bdyobsv3+xsrQm9CMKC6uc33Ftl0RPkm7qaaEugrkTxhdvFwiMz8AdHmtrxmPfz9Ihj2zZqBO9Xe87KV1NR44h6jxEm/DJVVTkH6gKoFSzx5ALedULbd6gHynKg6rshNfiZldDp1XHlYAUcFx1f7pPLOqyw7Oa1kVOvl0RZvR1QiES6/w1Ut5HhHAs7hFgdTbnS575prcWMDn4fcaCDz+mJGEdCN+jwx0TMxCY7xAXnct0CZgdEImGL9obxuo7VohKIKaRyAOb2SXG/EwPU8FHWmK+BJNu5FzLTfGRZ1oq8yJnPbp8x03Tj4/uDYRA2Z9SjfgLwM6TRHEPUlCWaLHnZuxqI+D38i0xVag/o8xkc1uBwCOhafh3rj2+EN8j8Ur5vuSX2vO+m64BrJtN0Z8A78HQ2m47WxgN4VXJO9Y/VgIkn+1uu2m3YOVFoo5H0H7ioVZx/dInBs9/He5MtgIvkwRPYvkPTOHdNGWYvj4sbkPq5DKbhzSypS5NsNzipt9hVXjvPytMihaF7naHWVogZ2D3y9OgrjySNE5D5Ab/ZTpBBFTZ0XuOrOEnEGaLrncFsybeH87hJZ2fOmAg9154mjJ2dDXJcFVEqGYC+vIq4wnvyFCE4S4DMX8opfei+LMxTo0yr6CuDs6/SoJ/G0KNHxS4VUQLGYjtU+5FzTneD/CDYlOY65KBUpoTLq+6C38Mhtrn3ab/8jeMDmCGESD4c+BOTNaHOrbwehMVx2tkD+qtBLqpvbfd9YojL0piqGRJvbfNus2QN6CTX20ZY2X7OWeLj8MRHdI7KwrR/hal3EwyEe9J/n60owNl6hBzkqO9rMuXKIV4SeonV0AWR3P1UMi66BA755XSCbwtX9oovareQ7Q6SFjIaiMdrS5kkqIsznJD0vQmRzQCpt+StElvTLm6tvIZkIl12iEDr9be2m3cOn372kn2Y8CxNC9APLtX5I5AppgsHh/LwV9Xk9PdhaZkfsnTzBZ/yZ3BjIVfCXjc7Ez+GYW/as9Qh+I9t+HzjYFTf1+up4I2ZUMb+GGhNx2oh7oxazoMY59beoN7JMOzKH+S+gONP3Z85CEK7pSryKOp8EWSJT9JyflQ37jmuzYxPyVEb7dkVqEIUY4ikNys7t/edeiOE9KN5Gg691fu5gZ0H5KOYYBv/GhlwRukdhIrlIIKtSkWLfnKTCROcVArdMTeEl+68ZMvhYmw9GsKmzCaqnCnoO6orsYC2Oi+brEP06+R7Hyqloia96qLCp8xZRDTPbpKuq2KocM74eqzqXQ/FpvvyXbW7uHD1wgLap4gE/B0+iMJGcLtArFBgcEDm008ZBUZXgvK734erSVLTkgN5/7oERc1dsEwisbgfk6wFuek8vrkow0XGcAg2OyvMcL1G23PuHHggmOhm78TWgh9mIp8FEB0fD10FlLgSHp1a9Px61e9s6UlS0mQJrm9/dl/jgkmNsBfd3gXlGWHjkCFE/BIGE/74hGTZWhN4SMbd93w5C1kyMN6J6P4MqgrkuCowdOBjbn3Zbm3VDqYuNGzDow9WdArwbyRMzHw+HONObmlZ3nxk+pmNE1itkm2hzm6+ZSjaK/pweYNJMH/UMwc6AQsMBdffxMz0j4hUhVvKlDnR/P4JuPFzeQMmsqt5S3dLuq4oxP1OwSz7b+kynaXWKh4Qf/yQRLqsApEEFA8QxnQ7b5tO7qIcUBFpW9qR9LYk3EHgYsa2ZUbXETCHh373KpK2y0GI7mzdzzxmwAcPUBCMxEsWY7ZORNAMHI4AnjEFbvht0DW6GoHo9uyJ0Q+Va/Y1vMTETh8AxY5ObfS3TiQyZk+REkjmtHTGDGBhD8BXq8gSW1YLmdDdBcaFlxPEtatEMNdwcOrhaC/OsKoi5NuTpWFUJBjFjC0BHWn/3xmI8iM6sBHdX7II3TQbRxgYW+XQLviGYSB6ZipT4FtHBREctIGdBjARy76+db477eOpOnkTyYDzJgvNCETnNr0AggvGOFMQoQnz358KmzotF8UsBft0VKbaOiolgU7JVXWybdgbu+F7VCDuJOTM2el+BJflcSbP8iztVpMcBjuuqKrZmJQWbkv+FIp2KlPgFYxp30KKV+78N6JA1Mmjse1Uj+l1MS+ctH9njOi8pGJUhA/ws64msbHZHhU5SFU/iaWFi+Z40zlTonwTOGcDqCanIjtY1Onj70MGrlrXl3i87UtZ8ru8AkuGZBN9bLPRjOv8P6CVX3XD8bp+dcc8bvhKcpiljSjTtsC31WLS5zTczIlERmqeCH4vo3pGF7dbUQSJREXpTHQyJLszTFakI/VIEf3RVotNbWn0DneKVoQehOCDdszpoU48QicqyqVBpclV+Wd3in2DbWFH2ZyHpFTJlenOr1V6eiIfLngaccWlNH+BXIMXDoQsU5kHleMnTzCeHxnDZA0L3UmhVPoOyeEWIRccnfp2e+IllO8KRxQIMcR09PI9sOGfORbB74skV2cCgKRFv+esvJ+OIg5r3HozFXNPN8EbMdHuOgYPdcFMvIbs/MmZaHVD8Cw0m2dGOWpwHxZUQnG7u8H6oMURDKr2odrESCrPR8fQVeQJ1RsljR87iXTHX13iLiNGCH0EMwA64wVx6vJFJ+mUHh0WPbzscMeNayqTf49Bgwuq8kcm14W2wFfWwJmcb1JggPRYp2+ZJur0Q8zEbn/UqA3mg2wufDQfuMyQbWr08cgjGuw4F3H/A0bug2HHQkJ5j3znZQqaMd8RUhNLyi1JVJVbnYiKYSLYBslk+g66MgsW9XQQ3dVWV+hbcRYnkg6oYn9YBY96tHml/njK/v1OBz7ojJda9jAgmug4A3KcE+rUicJSvxXtT8gWolq4PB4IFkln7AWeszdeDEleIDoKLzXucTyZ72ptnkVUkUX5bKJBzbQTdYDz5MhzcB8W5rqByRVUJC28rtphxZfcnc87PycX57NlHkeuP3sKDxQYXk7dXwXcHNxGObGho5Nu+jIdDrPQ6os1t1O1bEa8IMRWTCYWnZY2nrKDEE6JjVjkDt6/18QpJnBg6Wh1DJPtLtLmtn1HL2jBdEcFUSbvjI4uWWG+R2fHOWwK908/Bk5hbWXZ6QOXvcHBh5K4231tcvKKci/BIhXtQdfMSK6kqq3Rphv4/9s4EPor6/P+fZzYJl6KCCmaPgOJJNggeeON9H2QjeFQys6Di1VatR622xVbr1aq1HvWA3VnQWjAb1Nb7vltFJRsKnpC9xBMVJJBk5/m/ns3OGJKZWSrQX3//37xfr3ntZr7L7rI7+/0+3+f4PPyw1twqGcmOxCO19xFoCoinqU2ttheqieSqMKhfNNniuuOL19e9A+I6hXBCo0ueSOlH0lNP4b9R80CQcma53iReLxVfzl4JYTpeBxelzvfA3aJZ4oAZ3iCc6JpTIZyFZUWvQDldCangYDwLwp9wTzFnwRnpgSIdcUVB1DlfoZvunBZREHXNp/q3Kmim44mimBcQdvVKdBtdEtp8oWwzu++9Nz/FPUWPiz2TUIWtik3S2rECO2OeS1PM7u9JYurueSpnYzqW4nI8jZGlMzKvuO5Q/wfpKXkg845twn1JIEtKuhczUOhctfLkz88fbWsg+mctOxQ+5SkQz8w11rh6xPyJzLMwjD1yy0JDMMO+DFXwz86OAfNbUplRNleiuxR2KhNPyDfW9FHL7klAT7cyMDinhtyNnmLSrSFaUmxwxRGfaNWOydF+PSN5IgcNKKwd+eHUHV0rmbpzVVCrMI11UlANxNuuZlJOAGFIBSoPaWsc7ig2WSpvltDjWglv5hpDtjo1gUT6doNpKyoK25FrB1vBn0g/8rV+5VHfPTvbNKRlLnTsDvxvIL/7F8XwMEVvJMa0lTX8wxF3jExmrjkj65t4GTspfDr5cD8Yv3HLVRDikbqHGHy8wkqdU/8RoSQHvpSJn4g2tdqWGpnokbpfM3gGmFQ3/QshHgkvJ+Djcj1Y4ifXHQaj6Oa9R0u2OEr9CnqkLiEtoctVmtwfGVvTic4lDPpHNJlyTaqKRepmKOArAb5YTbZKyZkj8aLoG2q0ZMp1dxRvqJOM7x8zY4qbOJnIhVf5lFRHwTCvDemH4dj4738YcUmbblDZTTs3aju7uJAfUaz2KCfH3V0Z8GvcW0Z0rFtMbGdUY5irgumF2BKrkQHjJdxbxivR3ZlWFEQfw93F/BpnziomUw4qW7Z6DraFUZRgf9u1065wNiS02QgDh+C+YoWKM9OLVTu5slU53Zoqkpt023rkakgljqhi7uraTK+7Ikkm2l/hnuI1ao+EbPJ4FM/DwGorOV9CN465Uv8FiLFrGnLy2+vz//PH089DwVAYvDin1ThuYoJ/+bza6GiX/j/P5jR7ETETv56ZDfBkAu2VVYOOXushc74cPKCweinAH+bUkORZOdItukXXkkJnZ6cEXXOf/HparrfRuaXBrd2MnhGxFVt2Kisl4XsAoeuQrLq943vtLq/FGRWKb0LbFL+z9k73e30KCh1goGKPTxqrbUPl/viy40CKeN83g6Ec7Ka0OiL22fAOZc07ojbKoJ85aZVU6+lTZONOTN+A+bGcFrrGGrTBr6evNVZ+dcUnPx5bzFspnZb52tnjt/5YhocYG6IBIcZH2eTK9UTi22Ipya5Pdj9SkmgRj9SJCMquA327bOvWr6TUYv4tMOaW6+Jaqor5MbFyktq80LkkrnsxlQktoyVTjl0XhXh9+EdEmM2M35Y1ehpqpXvrUK1MM7nZkT22K6BDOtg+G022uv5QYw21txLTTxTgjMYynp54JJwF6Gst2eLqPtTra6eC6D6D6bpoc4trfbseCUuly3jizpFu6qX3TgzvUalIMqW7polEvjfv53ti5dqCuZDJD9pdAOp/Hrl2zUS1FFBsqS1JXFJ+Ltd5BRqhg3Eq8mjEs8VeLLIAiYdk3WMItkMtfo9VeAdvF8tHpfxS9G7MW2lZ0H2MwokYiF3wEebgu6I3Usp55fcqtz0PceqfAgMd+Li42JkThXkrdCcUVmEAalCPDnyGtuIOvme1i3m/+3YkjkUVhuJDzEahWCIq52WyNm+/vx/GuTDwHRato7/R8/m6j5E4CENwED7Fw8gWPyfzMeZzCd2PHVeUg6/EAiv3xHzNdY+tMRy74kqswUK8idv7jPc8DsKVGIDRWITzkS3u+sWDZR6menMnxiCAXfEoCvg75kHKIc0x+RzMxx+GSpyAgTgX3xS/OxMJZTiXpf73IEnH0tRTEM9wd6kskPDraVnAjgTR33ONQXcPhp6WHf5HOTXkGrLy68uuBZQrGDgtr4Zcw7p+Pf0BA768GnLdlAYSyyIM5SHpDGsnL94T6SXDwFHU0VGXPXOUa5+iYoM88NZsFPZ3ql4R/LH0tfDhChRYzUVrXBWu/Xq6CeATYBgH5aIjHY0J+b9LuTITTs+rIbuOyNbv2z/zo5egKHXoWHNpbvqusuGXMfMoPkZ+S9X3vb+ACavIMF7Pn7WLiAh+/5v8/pA5a4sh02+ejMpBt6y456druGONKa8hHlRnL+K/h+TUvCRvTIwNWVQ2ph672YPDRCZp+c+JMeIjkUrjootTzsmk0PtWxowqn9KvQqHK1Z0F2ZnIud5H8bFb9K8YslX/Sv83a7vaVrR3SlxdxmRy6HM7Zvjmh1YoSuWC/DfinjJfa53nM49jRm194ddru/71euZrmdB7P8Z6v0fvtM2UwVUVOz+y5PMZa7q6pCRKzpuH+bgip4WH37CmC182L14uX6S50Ky76AA+/+D+I2q33eyUtq/bX1ryxXey4JmPkcXG/DfF+3XDNj9SWqK3LF8pi4n5HObjet5WjNxqwPhVHcaXn3+3ViYe87HmuPXYARXKllU+ZbNVHYUVBRZp4OKYXC/m48z7VKFQfwa4YLB8LoJ58cth/i1j8tzmOVlMJcPa0YvzX0JRae+/5L14/Hcjv2n3MNd/D/LbFQP6qB6/yd6Y81bPW+ugiqpK+Zfc2dFzzrPmRfM+VfavUgZuPthY276S16wSI6f3Y6zDt22ohir79ev65KPFMAwx+Oyfs//AfpWh0WON1Su/6MoukWRu8zF9jqrQ6NHKFkMDnenFCwrffN5TaLHn/FS8rRo1bjx8Ff06l6be5o522VjImHlY856y5bbb+rYaPsL4+tN8YcWnonJrzovmYT5eUbbYehhV9t/cWPnlZ7y2+Jy2j6Wq/oOgVFShc00HF7pkvuzzmNLtfwr5/CXU2KdR3QZgGR5mYyNZ3MW1vLGQCVtK1dwzfD3+LyITnuxQ1vGE/Rcj+Q0ity2dFc2Yp4c95gLRc/In+FApGf9Fz8z3j5PDvN99W4H+RU9HF1aBi8/TfX7dCbf7fiU2K4o9dxVdwOZ438cpkAWyAga6iu+h+3zPx39/v9gYsfiK5nsSej7n94ifqj9WYGVxYpZkYcfd8X8x4kKXJPhDQcoosCGbAw8PuZYlymBfOvzDkXL0l+UHZcaxy2Y5/0AkcVRKaqVsV1zrYnGKW0fcOL1vRU3P7lZc1XJfDrkvk7/s+O0O+eH0vN/7kPOm5dj7EOz+Nm973u89aQrre7/n0dOa733b+77d3z3PyaTac9z0zJiH6SZ2Or53N6979DwnC4fTbc9DLHvzVj53ie1JOE9ip066Hv8bEPe0XMtroGEZKnEb7i0m6MkyJNelHOvePxyXYSAm4jFMRJd1HcnR8zrsvn84HsQatOKVYkin52OEnteHZJQ8hAyuwxKIJP+6Yz3/PgK/QwWq8XgxQcy8JuxvJ2MRVuM2/K2Y09J7/Pv7DdgTg5HEUmyPF4reK3NMXvd7zKocceXfUyxzdWY6roeBy+BDA/5c7IfizNnFnBLppONaDorpooSMZhB+j3vgWlqO6Xi+2KDvnvUIOZ+NV0FYU7ZB3f8i/HqmgK6Oe3LTdhB3fM95t+dtvy2mXH1OxVbDJ379199dUPi0TbzZ5rXe85DfQOVmR595qfHNF/nVr8+XZPPiudLRc86Wo7Lfrvsd2Zl/f7HxzRcyT5jnzTnbmsOVwdtUA1xhfPuFbJbN8/I7sR7T4zB/O/8bkd9Uz7l5DfUbqPiGbLctd7R/XvgyL8mp8vmbyuM9j/ZBR049xTd46GarHr3jSmPtavlMJTnYlM7oebt6y8ZrW7vyH2DVM3EJFUoVmaNy+AZiGR5ibIir6L9VxMnD4383M1CFGUUj7P8e04s5PDPLJogKZ+N9MGaW1eoQpDvs+j3nZWDsgXuLfSfcmY6n0IWLMbNoHHv8/4Gscb2NkZ6GjGmwyK159P5bnsPpMFnX4JYd/YxHHzW+Wj7/y9vOEmXgnhsDuTUNiuKx3e1vP/bJBeNEH6nn+T7PWa1nLifmcTktVPZ69uvpV0ghLTsl6JrT8h/GMjyGA8XscSmb69ni2cPDw8PDw8NjY7G/eD/F8BBjQxIyxfgws5w9PDw8PDw8PDYmluEhxoZUOIjx4SoF7uHh4eHh4eHxAxGNq1fF8BAxnYy0WC92G/Dw8PDw8PDw2PhYhocYGyJLLMaHq/iVh4eHh4eHh8cPRLr2viaGh6hISlMdKXlz7cXh4eHh4eHh4fEDsQwPMTakCY0YH2aTIw8PDw8PDw+PjYlI678uhocYGx+XjA9XbXwPDw8PDw8Pjx+IZXiIqqgIjIgKmrsKoIeHh4eHh4fHD8MyPMTYkC6yYnzsaA17eHh4eHh4eGw8xgN4QwwPMTbeLxkfXkM3Dw8PDw8Pj02BZXjsXOqq+B6AXaxhDw8PDw8PD4+Nx94A/iGGhxgbi0vGx67WsIeHh4eHh4fHxsMyPMTYkDblYnzsZg17eHh4eHh4eGw89gLwTzE8RgPFNtCLANRawx4eHh4eHh4eGw/L8BBjI1UyPsLW8KahH4AhALoAVPQ4fP+hvxnocxgb+ZzdefnbPAq9bv9T53q+n55HT+R66EnPv+U7UkqHeV5u7Q67MVHG9fDw+N/BIACbA9jM5RgAoH/pkLndvG93zm6e732Y43JrzhvmfGMeTvSe12Re7f137/nW7pzc9jx6npN1y+5+z7973pY71/OwO2ee77Q5b3es7+PkkP9Xb7YpnV/hML4x2BPAm/JFirHRUjI+6qzhDUOe93wAh5ZCOfIf2qJ0UXn830R+QNIT6DkAbwN4uNQV2cPD438WWeh/DeByAFX/s2/F4z+IGGSCnUH3KoDjAXxtndk4WIbHGADvAlgIYHdr+Icjb/auUtfbTQIRwGxZd7Kg9bZwi9baoCrfVswwVncWen545q7dtKQVH1GVQqjsNFieU87LD9Fj/TEv4J7IZ+t2YQvXArjK+svDw+M/iWwKrwdwnDfnedjQDuC00iZxY7EHgLdkQRBj452S8THWGv5hSNjmDVnzB/fzfdhR4OFrugxxyUkfmHkA/lJ6rS1LXpDiccbu1fd9vaaz629LPn+wx3lx84krT46BcutTaLDBXMV2y9zGx3RxWcfgfhVbVfmUii/bOz5ixprS+Y7SYd4v3u7lH3y8wVi1IP9tc8/n6PGY4rFPcMvxOw4ZGFn6dfsDr7SteLZkTJnj5v3i7c8OGBmvJFRc//LSehfXXeGscaG62uED568pYNblTy65ooe70Ly17scjdfMAPrbQ1TFq2iPv5a3/fS9mNYS3V7joFXteS6bEuHQkHglfBieaEaoAACAASURBVOCGApM6rbklUTr9YwBn2YTz5Pzt1l8eHh6bnMEnXfjBtw/fKqrV5qZA5oOnAfyu5P0ubt5K9J5xzb+tzdt6HrKhk8O83/Oc3WH3uJ7PZXdfjt7vyfxbbnvf7/m30PtW6HnfpOdn0vu+2yGfa8/7PQ+7c+bRe/7u/XfvMTnMtaHnffNWHt/z//Vd6W+JShwD4E+yjpfaqch1srGwDA8xNsT1LQbBOGv4hyG7198CmAng8FLn26cAnFqKG/UhHgk/DcbevMXKYdH4MlnMbUmcFD7W8OHvAP1BS7Zc2cMgkThiz4tMmXHIqEcUoi2veeWDQzo6ih9wzy/e+iLOHx8I77T15g8XDJ5/8eNLzix9KeaiL4+10BvqnmPwvoVO2n3aIy2ieeJIvCG8CIyBWjLl2nRvZv3oA3zkewHEd2lNKVmAHdEj4dcY2GlZXWrbGTOK/ydHYpHw18T8D6259SjrpA3xSPgGAJcYCp809aHWv1kDvbjtmFGDBw8Y0AbQIi3ZcoA1YEOsvu5oIn7MYP7D1ObWS62B7zkEwE8ATCz9vbp0gXt4ePxneATACT1eSubrnwH4xjrj8X8dmbtvLH0I0wHcs5E+EMvwKN4BsKAUf9kQxMg4AkATgAYAz5T+tiXeUHsTWLmIDePw6PzWF6yBXsysHz3GR8o/QfSk1tRyojVgQywSFlW03cin7KrOW+iYQ3B/ZGxNJ7qkkud1LZlyfI9CvCH8GBjHKIyDG5tTL1oDNsQbws+AsYeWTG1lnbRBnzTGzwVjCRG/qja1Hm0N2BCPhMXVdWQlunb5UXKxa5JmPFL3PjEbanPKVQwuFglrBMSYlCuiTQvF3WrL3EnwrS6EMwC+1JKp3t6KdUhMGh0yCsoSMJ7WmlMnWQM2XLjfiKf+9HrbEYVu99VsAI3mmIeHxyZDFpE/l+6LZ0M2XP8s/b0Ofj39VU4NSTGAK/54WjzZk3NaSDwPrlTr6Y8J6MypIRGudCQQyxzNCv89p5Z/zoCefiyrho61TjgxY4aCGTNcN20mAT1zfVYN/tw64YJfT/8rp4bKSlEEY+mJmWhovnXCBX88/UhOC7mudYJf/3Yo8M3SnBocbJ10oFrPXJdXg+IBL8uwm17+16eXHmjqem3MzvXi3Fgghkcx2aNkfEipy4YgH2rPBUeeT563D7FI+HQCZiqgWxqTLb+wBnoxO7LrdgVUyA/kk3ILXzwSTgI4USHep7Gp1fZ1hftPD2/V2c7vQ1GyWlOLa3ip9JzHMBvRaPMiCQU5Eo+EZwE4gw3f3tH570roypa7z96jst8XHeLCWqUlU66ibbH68D1EOJOZj4o2t4or1JGi0WNgnNaccp0s7p+0++6dhcI/iTFbbU5NswZsiEfC0sPHV857c9sxo/oNHjBgGQOfRpMp11whvb72Ria65KLHl7SsaO+UHCPP6+HhsekRN/rKUpWJdCOX3+m3di/r19uWMWh1vsyC6tczjwJ8NJFxSrZxhMyVjgT09FvMCOS00HDrpA3bPvDxsMrOCjFQnsyqoYg1YEO1nrmXwBozH5zXaiQh0hG/ns4Q0dfZxqDrOhKYnT2bDeNuBv88r9aIV9gRv56WDXNdOQPN/2B2J6wxWkCYn1NDEgFwxB9P/x6Ei+BTjsydEZDwuz1z2edvz37C4La8GnJduwOz237KBt1KRFdkG4OOG03BH297GKDDc1NHfADDkPlZrhEpDtkYWIZHUUmsZPWKjvqGcAeA80r37yxVtvRhZv2YA3xkvEyg59Rky2HWQC9mzIAyYmF4MQhDFabdGptbPrMGexGPhG8p5gsYxina/EXicbFl7qRJvtWFJdKXRhZTCQU5Em8IP0DA0QbTb6LJllutARv0SO0vGHQt2FC15kVmXoMt8frwW6Rg+07FGHXmvEVfWQO90CO1v2YovyTQ+Wpy4d3WgA3xSO2dAJ1FpOytNi2UsJktJQNhOYPejrp89oIeCb/LQPXazqoR0x9dIMaBI/FIWJKTh61tqwpOX7BAQlW2xOprzyGiu4joMrWpRUJj5o9AdkDSM8jDw2PTcBAA02MrG07xcvfBH08vYEJ1Xg1tZ520obTo7ouCcUxu6gipVnPEr6cfA9GBYBqRUwNfWgM2BPT0J8zI5LSQrE2O+OPpq0D4LRuYlo+GZNPnSCCRXsSMzXNqKGSdtMGvZw8BDAn/35vTQudaAzZUJzL3E3NDocDjlk+tERFOW0bElvbvVHx5IrRmG0PyHTjij6U1KIixYVyWj464yRqwwZ/ILANjbU4NunqP/PG2ySD6KxHdlm0M/tQasCEQb7uBiS4l0HFZNSjvVbw+kpqwsSpSLcOj2LSlZHxIy9oN4eRSEqmwb+l51yFxwuiQUanIwvgtf7Vy1+gLznkd8Ybw82BMYNB+0WRLn+cymdUQvkBh3MygGdFkiyRHORJvqH2HmUYaXRW7TXvkHcdkynhD+HZwMVyU0JIpKTNzRI+MqWcYTQBfryVbHb03QsmDUl9g7DetOfW6NdCLeH04SoR7wPi92pxydY/pkfB0FvepQedp81ukosiReEP4Y2asjZbxtMQjtWIY7k4+Y3TjvEVSBuuIHgn/XXJ6CgVj7NSHFzn+AGfVjz5UIeUpgO/Rkq1ioEoS02OlYbkWPTw8Nh2Sn/Vy6b6UzfbZIJgGQmWhK7gsOtKxlNIfT78Owu4G8wGfaDW2BoxJQG+7l0Gaj/iQdGPNK9aADQE93cpEm+UagyOskzYE4+nTDAX3SzJsrjHkWhnn19PymrsNXxMctmA69fk/m2wTWzS8ijb/CMCz5cIc/kT6d2BZlJXJOTXwkDVgg3iPAKU9pwZd59xhsY/CFUrl2yDMyTWGotaADYF42yIm2jKnhvzWSRv88exhIONpQJmbUwOunpbq+NLTiHwJBl+bV2tmANgfgPl9VZZyIDcUy/AQY0MWQFnYxVjYEKQsy0xStF1I4g3hFjB2JuK91KZW0Q+xJRYJxwgQS+1MralFYoi26A3hw5nxFIFnqslWqZpwJF4ffoYIE4h4X7dQTDwSlgTZaQR+Rk22uuYeJCbVjTQK/C8CPawmW1y/2Fh97Y1EdD4D50eTqbg10At9YvgYJvwdhAe0ZOoMa8AGvaG2jkHiwpwVTabOsQZsiEfC8j3voCVT21onbdAb6h5l5qN9oPFTki2SeOyIHgnfxsA5BmPS1OaUY9nVAyeOH9ZRsfpjgJ/Vkq3mj9rcgckFLRe2h4fHpsVMmhe5g3Vy4PyJjHhVp7KiHJw/w+8YtvAnMq+BeZziw4GZM0ISpnfEn8heCTauYWBaXnX3SvgT6acI2Dv7cXAIZpBjLkb17Pw4MjrfAOOvOa1mijVgQ7Wenk/AUdTZEc6eOUrCxo749cynIG7LNbp7Wqr19FRJEwBwZU4NuW50/Xrb2yCqzjW6h5cC92WGcCV/RIxUVivjFdEzr4N4V66oGJU/vfoLa6AXwXj6IIPwLAiv5BpDktTvSOmxLxJhfrYxJFWTJmb1y/al8NyGYhke+5XEQl4rWTgbgrjuJaHUdiEpJUkeRiBNTbY4WomxSO0vCHQZA3+IJlNiBNgSn1i7AxQSxdUXtGRKds+OxCbWPkgKRQA6WUu2SFa3LfH68EVMuFwBlqjJ1MHWgAPx+trPSaH31aaU62cXrw+fD8L1DNwXTaYusgZ6Mevk2v18Br3IoJe1ZIsIsLkSj4S/BGhhucfGI2HxRB3fr8A7nfZwqySL2qJH6sTiPYMJx0ebUqY3wpZEQ+05BtPNDL4xmmwVC9mReCT8KQNt0WSq549a3rPEMGUX4gkXeXhsekzDQ5IRJd+jSCCR+TkzX0egs7Jq8D7zfG/8euY1wNiTC3xwfuoIWTMcCSbSpxrAAzDwu5zm7pUwvSIGVez7SWO146YwcHNmgDHUWE5Q3sypQamcdKRab7uHQNOYcUxeC0nhgyN+Pf0+CL5cY8i1dNSvZ/cF+CWGEc+rNa4b3epE+nFiHASfsnPujEDWGrDBr6c/JEDJqiFZ4B0J6OknGHyIjzEurdVIcYQt/lh2HyjG8wx8lFdDrq1QqmfndoZhvKkQZ7KNIWmh0hPT8BBvjTSS3VCKVbTyhKY7RYwP11LJ9UCqMx63MzzikbBY05MBXKclU2aZTh8SkdopDLqTGY9qzanTrYG+kB4J55jxhdacclVcjZ8cvgUGzmbin0WbWs2M7j6UKj3+IKW/hq9i36nz3vncGrRBbwgvMRiV0WTK9WKN1YcnEUHyPp5108CIN4wZTWy8IQu0lky5XixCPBJeTIQKtSm1o3XShlLZ7GWkYKL6kLNXIh6puwXg85lxfrQ5da81YINeHz6JCXMJeERNpiZZAzbEI3XvAVyh9f2cpNz3iZK2iZRFe3h4bDokqVREoQT5vcnvToyOCDM/xAbfmI/WOFZy+PW25wCaoDAOyWihl6wBG4KJdK3BWCC5BbnGoKvXODA7c6m8NsM3La/63b0iejoLxlc5LeQ65wf0zAwG/4oU5ZzslIBrKWi3McU75ZZ+NBwzDnEMJ2w/96st1ravyhLRK9nGoOtGN5DI3MfMU8koHJqNjnSs2BSq4+mXiDBW6cLOmWkhx/B/sXpIwSkw+IicVuOYdCoeIcXoep6Z2yvZ2H1ZdORya7AXI2JLt+z0+RaAMUxhjMloIQk19UTyOyQXb/eA3laf7Q7BbAiW4WHG/cT4ONAa/mFIbbh4E9YxPOIN4V/B4J8R4XY12SoaHLbokTGHMBlSjvoPLZkST4wj8fq6d0A8fNlXQ4MzXnjB8WKJNdRdSsy/JMYdbrkS8UjdiQz+KwFdPjYOmNK8SJIlHYnV1z5PCo3RmtwrSOKRsLjNXiDQIjXZ4phNPeuk2qCi0JtiWypMdW6JtIIeqXvCAO8TTaZEjM0RyRUBiVuQr9SSrddZA72IReouJPD1IPxOa0r9xhqwIdFQu6cBeg1M72jJFteE5HgkLLuinWq+Gjr8kL7fk5TASX6IZ3h4eGx6ZK4yEztlMSl6P/x6eg0Dybwactzo+fWMCA3WAzwxp9Y4av4UYVb8icyXILxbzsVfnWg7gViZTwr+kJ0SFOFBR/x6WqobJa8haJ20oVrPnEnA3SCW/I9fWgM2+PWM5OYdWzAKuy6PjpSyUUf8ejoH0Gc5NehaCVkdz/yKiH8Fo3BBLjrScaMr+BNtOpimEBUOyTaOdJRqCMTTtzPhLBCm5xpDjmH6QCwTZh8/B8YWioH9M1H3UFhAT7/AwB4MnJFXQ3ab0qLhscWpv7xys2PPuoaZf1PK//ihWIaHGWcXC3aCNfzDkGRMCaFYWbDxhvDZYNwM8F80lxyMWMPuO5JReIuJVgzyVY6ZPG+Bo5hNLFL3CIEPI5+yk5tWR+m1xYPxsFuuROzkugOVAj/HhC4yEFHnp8Rr40g8Eo4BOJ192DM6LyU/BltiDeFdiPE6A0YVKsb9KPmOrQbHnB+NH9zV3v4mwDVEyr5uVSlCbGL4NlJwXoFxoFuCatFAYJLcHUmQnWoN9EKMLgI3MTju9h0JpfLmhQC3F7o6a6c98p7lru1NPFL7EIiOUzpot8ZHW+zig1J6LSXYa0u7MQ8Pj02HlMRLGb8gc/964Y+n7wJhKkg5M9cYEM0dV/x6eqnMDzm1xrUUd7v7Pq5RqioXg/H3nBp09Zr64+nnJZk1Fwpug0Oo9wbGIjRbtIHoSWbE8mrIVSrAH2+7BUQ/BRsn5LQRsgFyxJ/IpGQxz6lB16qYgN52BpMSI+Zbs2rITkDRwh9vuwJEvyIYl2bVEY7qzQE982sGXw4uhqyusQZ6ISETMoxnAN6SQI1ZNSiq2Y74E2kdjMNBuDPXGJL2FXYUQy1Dr5jXOWCX8fOyauhH1sgPwzI8xNgQV5AYH2VzGsogFrNkGsub9ekNtWcw0ywC/01NtjrWY8+dtO+A1V2rUiAMN3zG3lPnOVdGlMIBP4FCR2oPtTi6m2ZFak9RQHGAX9eSrY75D3Mmjd6ty1BeAIuxxFdpyVZJGnJEj9T9QrJ+2eDG6PxWxx/hfZNGD6ksKP9g8PYG06FTXYTHSqJnYw3mhqnNzgqigh6pO5PB94L4p1pT623WQC8S9XXbFog/VIA31WTKsWx2VkPdeIX5VQaejCZTkhzsSrw+vAiEUMFHe06b56zgGqsP/4EIF3HBOCn68KJHrYF1MQ1VqWwSJVoPD49Nh4QnxJMrng7xeJTFn0j/TBY8Zv5lXqtxDJGb+BPpf7KBUL6MVofg1zPi1f0wpwZdvdvFEAOhngzaKxsNOm70/LGlu0Px/QNET+cag44hbaFaX3YBQZH585KcGrrZGrDBr2eeZRh7dmw5MPDFSds4brRKpbgSjpqXU4OSVuBIdSJ9KjFizDwnrznnigT0zI8ZLJ5qPaeGbOUphJrE8pFd3PkkCAPIMG7KajWOa4MQSGRuYBZFcX4+p4Y0a6Av3YbHBXe3fnn7dEeP/b+BZXiIsfF8yfhwdYutBxLL0+XCjteHpxBhtgGaGy1T7RGvD78EBfsbwFFTm1KSnGqLtegyLtaaU6LbYUuiYcxRBhceA2jxQJ8xbvK8RcVYZm/mHDNqcOeAAS8RMIiAhOqSyCrMqg+fpBCaAbpecxE9E2L1YYnbhcH0U+37fiV90Btqm5jpUBAu15pSrrHIooKrokhnv7jalDrbGrAhHgmnCVilJlOOu47YxN1HkFKQyqL3tGTKVYBGiEfCkqB1OME4TE0ukmvGllik7jwFfDszX6Y1t/7eGujLKQAerPQROgu83jswDw+PH4SE0sWzvV66DIHZmaPZ4McA5a6cGnBc9ExKFSRH9KeqkR81DncNFfv1tGxafDk1NMo6aUNAz9zI4EuIjUlZbYSjPtPw2NIRiuJbSMCSnBpyDf+WSkxlLvuz22Iu+PVMAuBTGcb4vDrC0RMd0DN1DBZJigU5NeSaKxmIZQ5mhZ9nxst5lwqWQCIzjZn/CODJnBqSTZot/jnZAArG40xQFOa/Z9WaciGriwFcjG6tlHKVrGYyslQiOm0g/x2KveFksjcrC0QAxnFnvJ6I/G4xKXFWfa1BhPujZcpR4/XhOSA0gGiqW9nsrEjdOAX8BpH7ohuL1O1DYDGivlZ8xt5uGhTxSPhvIHE/0ktaU4urWMxfTq0Nru3A+0z0aLQp5WrNxiPhOWLEEfBnN2MmVl8rSnKng3GX1pySttSuxOvDX4H4XTcPjhCLhKVcKciDV4ac+t/cPGnfAUMKqz5gYK2WTI2Shr/WoA2ioKoQncHMZ2nNKfFq2aJHRh/C8D0tMVY12eL6o55cO/zlua3LDyDCGmbP4+HhsYkxc6r6JP/3plTeKdVvz+TUkGv7A8EfT98Cwk+4go/K/6jGcfMoBBLpl9jA6JwWGmqdtKE6nj5f8gIZdFleDTqKaUnSZ0f7qsUMfJdTQ66J9gE942fw+wA/l1Nrevar6YM/vuwakHIlsXFGVhvhOOcVn5P4XTC+zi0N7uxaChxbuouiKP9gpm/WFgaM/mKavQelOp4+jRTMBBcNGcfcy+GzPtnGV9H5BECdxPxx1iVPRwgkMqezwX8CUcFXMPZJT60xQ2998Ottr+TUGrNaU0JhjpWo/waW4WGWwIrx4VqetB7IQlOMVf35xNGJcx5ZpJoDdsQidTMIfCmDrnRTBp154s6bKxVVGYAWuKltdudU8CsAbU6GcqA6f6FtDwIh3lB3F5gnAPxhD10JR6QcVOKjWjLlaiHGG8I3dwuP0dNaskUMMVtKIZsLRffELf/CRI+E32MQacmWnayTNsQitY8AdCTIF442vSsKrbaIngoxbVfw+XYrV70Tj9T+DERXG4zrpyZTjjFGCe8YxEvB/JzW3Or6o9Ybwte93Pb15fe9lZFrUDojShdjDw+PTUfRw7g+ydzdHgnmnFrj2vNJ8Ott0wH6M4gvyjXWOM7jQmB25gEucASk1OXUgKNScXBO+kijQI8R85+zWugCa8AGv55ZDPBQQNnVVRW1KDGezhMok1VDrn3JQnqbWgDFSKGrs1OCV1sDvRj12Af92j/vJ5IOQ7nQMSY/dZSjVEGpguRNZhoBpTA+P2WErUZStZ4+icDzAPqwY9XKvT8/f/Qqa7AHwxILB1XwVk8CtJaYK8vqf8TbDgPoKRDWssIn5afUOLbgCOiZBwwuTMprI0zPmDgQHFML/g0sw0OMDXkDrg3d1hNx4UgypyBt7W0/MCERCZ9eAGYpwD1qMiXdSh2JR8JilXVqyZSjNGxp0ZMKCj9Ap7hrddRdCWJRhvvmO58x4fx5ixzfpxCPhCXnpL+WTLnWWMcawj8nxgUMvBd1yasohoyYbwTRu+X0NwQ9UvcsE48tW0HTUPdHMP8Y4BO0ZKtjslQ8UitxyH0V5nGNza2LrQEb9EjdyQyeA/BftWSrqyEZj4SXg5HVmlOuP+p4Q/h8MG6f05JveubDL8WFKJ+/XC8eHh6bDtngSA6ba06VX09LSONIHlIxLH9CtWurhOpZy/ajCt+LMPi+chLjwUT6dwbj56QYk7JTnMMmI+/P13R0dS1mwpP5dcWs+uBPtL0KprEGVezxSWO161zm19uWgJT+5VRRA4nl45k7RF5iTpn8B1PBdS8i2j/bGJRQiyOSIEuEcQZwdl4N/dUa6EH17LYjyKCnGFhuGIV93SptAnr6SQYKDN6FfL6D3LRCQvG20QVFchmN70C+63ONAcdqG38i/VswXYH2lVNz5+wmqROCiFO6tu1YTyzD40iJIZU6y7q2UV8PpFzVVHKTRXJF6f46xCOj9weUV4goqTa1OMauhKLaJmNnZTMKNs5ukZ1xH6TpWtXna+X5RhHocjXZ4iiAM6u+TlWIJUmKCl104Hq0uC92m11Wlxrq1o4+Vl87lQg3gOhrQ6nYz8mLIBUksogDnGGjQprJOcoSC8UmcQo0Lrg3ntMbwhcwQ3Ybv3DTSSmFgU73KTRhykMtpnyyLXp9eF8mvCKxyGizu5iaaIqUjDPXZnLxSO1xAD0imdRaU0p2CvIDEHdj2e6KHh4eG4T06ZA5wtHDWIz/E/1eksLz0Rr3mP7cRVX+9s2+IKJXs40hV10LS+3TwJW5qLPa5+i5i6q+bt88D9D75ZJOA3p6PgMnkVE4pJxWhj+Rlpy0sf36d9Z8PHkHx4rJ7rAJloD5jZwact2IB/R0kpmPJUU5PdsYdG2Q50+kY2AcBcadTpUp1XNy+1OhIEqjhgIclGkMOQupxdPNDPhAOAqGMiEXDTi2FKm++72tqf+A5wHqArPIwV9iDfaiOpGR5q06DL4pp4XE02OG6kX00tWbtZ5Yhocp4iTGh2t79vVA6nvNXIVhAPokGEnrdC4oixi8UEu2uibh6A3hucyIECl7uZWYxhtqHwHTngy+PZpsdbyoE/V1hzL4SSaQwXTk1OYW18ZGsYbwTGJMIVLGu72+Xl97PBPNEw0QxUUDpLiQK3gRBtqNCmNft+odId5Q9xMw/1HUBN2MqZknjj7EV6E8R4R7XfNfGsLXE+MSsDG1XCO7oq6IjyTx9LNldaldXY2uSPgFAsYM9G1WPXne66ZAUR8kFAbGuwD9LZpskb4+ZmhuY3Y/9PDwsEcS4qVs0tbQ9+sf7QRULgLojpwalDCwK349nS7mNZQR8/Lry/YFlJcIHM+WUfsM6GnpJdWV00KuIWV/Insn2JgGVqbktMBca8AGv56OM/AjUpQ9c1MCtnOzsMfdb1V+2m+bNCv0ea7R/f8U0NtuA0gF6KqsGvyTNWBDdSJzHRn8Iyh4PtcYsvUaV+u5scRdz4NoICl0YnZKUNZkW6oTbXMU0CBm7E9snOuWdCv49fTTAA8iok97yaGvQ/XsZfuR4XsZMJI5tUZyOsQrZnq85Npx1IH6N5But++K4WE26hLtCkk+2hDkjZnKd9K8prcKG8Ui4SwB35ZrB19S27yIAS2aTD1gDfSipKlxGDMno82tjj8WvX7MTkxGseENEV+sNrXKzt+RWH34ciJcD8ZUrTklr2HLnMjovQpQXmSAmNDgJDMu8u6s0KsksUDmY8u2uI/svj9QeBFEd2hNLY4dBUv/r4UgvKQ1pRw9VjMn1k7zKXQ3CL8pJxAmxCNh6Wsw2IeuMVOSiz+xBnoRi4TnkCQekTJOa1roKOE7d9LozVYXFIl/tmjJlKkXIyE2ydoWr89WpXMeHh6bBtmUiVdaPNF9wrb+eDoNQi6nlq10kHJQqa7z5xpD1dZJG7aZ+9lmVe1r8wx+La+GXDe20hUXxIFiXxMix2R3fyJ9JRhXEWhGVg26t62PL7sKpPwWzGpOq3HdbFXH04tIBMqWzQpixgzHjVZAz1zOYFnnZuXU0M+sARv8sbYLodAlAOVyamAfWSaswRKScEqKT3IsBxDoJ1k16Lg2ST8dZh5GoBpiI1aubNavZ2YzeIT8v9Z2DdjPKZk1NKtt+4JPeZdhvJdXa8wKx0E90iXES+MqxraeWIaHmeksC2ZZHYcySH6H5HkIEkdbRzArXh9uAWHrgT5jhFOJq1BU21RwJ5hucStbtRI5Ga+6yavHtBH9lW82f4UJQ4nxZ7U55XqxJhrCxxqMR4n5D2pzq2Npkj5pjJ8LxisMDFBAVzl5JSQ51ldZ9SoYfiK6WG1qMeNmthRb1w8c8BkYr7n1oCk+b0WVGAifacmUY4213jBmLLPxFsBzyuVpCPFI3SsEHkdMezc2t0g4xJZYJPwbAn5JUE5VkwttY5Ym8UhY4o8rer1PMyfIdiL08PDYqIirXDYx0lhsG+tscYFKN4FwWK4x5KqELBRDDMBRAwqVIz6cup1tSNlkfdU+A4nM42zwQUoBO7rKhieyU8CGVE7OLFcKG0gsizArTWBcl9NCjuuIUAzFMPYk0C5ZNegoShnQM2ca4D9Qt1aIeG0dqY6lTyVZx0hqBjv2yak79EmmrU58FCKulPzKgSJ2mdNCZUgBKAAAIABJREFUjjIRpcqhnSXpl6Gk8mrQUd5eCOjpm7i7hLqOYezvVA5cfXd+IPUvSIKuQl/STtmLg6bXWvLuxBstyDztGKL5N7AMD7OjrBgfrqIr64HsXs1EUanPtnTfS7kSeytMo9zkwPWTa49ng5qJ6BG3/I94JHwVAdMZ/EG58tLukA3vTqAnyiWyPnDa+GEda1cvJaLH3V5fiEfCIgoWZLAeTbY6Zj7HIuHHFaDWAN/lFgoyiUfCovL5Xbl+LSLmJcaUbxDt4JT/Epu4+5akFCRBaWEPT4MjeqTuQYAnGwYfGp3f6hg3jdeHfyTtmxk0I5pscfy/C6Xk3M20ZKq36p8o+0k+imd4eHhsemTBlko7qdCzBL78sewUKEbCAEU+KaN2GZjddiMbdEkBdNxyNeiq8NwtcU5l1T79enoWGKrBOPiTaMgx7yyQyBzLzI8Q4VG3kIFQFNQyOmQxfTin1Ug1jyMBPf0AgyYrxPu45VVUx9ITifBgUQpeDUlXd0csrQ7QSuLCaXbKqEPmfDB4QFeVhFck7DU3p4Yc24n44+lrQDiAgI8YVJVTg65deUvCb5IYu12p8Z/j9xrQ028ysBugjO1VaSThbzMH8S4A55XubwiW4WH2V5FEorJlpWW4E4CZ2Wx1s4vXhx8A4WSiwni16V+2VpdQUtGUCy+lJVN7WAO9iDfUnQvmXxPwFbjzQLV5iWMJVSmvYRIRvVvOkBBikfByAtLaul1U+9D9f+I9AXpeS6amWwO90BvCcWZMAOHvWlPKtSxM0CPh1xgYVa51fbw+/AwI+xd8tLubgqgeCX/IIKNcGa5g5oAQKZratNDR3Te7fvSYAiki8S4y+K4elHikVpJ+dxugGKHJfauHJDQmFr4ke5XdaXl4eGwQokUhnmHZ0QfMk/5EZiXDeDjfWOPYVkLwx9IaFMQkzJBXa1y9xn498wzD2KtA/ao/bRxuuykSqvWMSCr8ktk4O6+NcFSN9seW7gNF8g9IutK6Jp0Kfj3zOQjv5xqDrl3Dq/W26wjKpQRobiGO6njb/iB6kYiyXOHb060dfXUsvwv5ukQNeyWI73AqMS51r60B0cu5xqDjGuLX079gQPrkPEvA3jm1xnWjHZid+REbfAOJ0cB8j1s4ppikSjgRrByZ0wK9lcAtj4dvy23nD//jW8fm1JBrGfZ6YBkeYmxIcxgxPsoKxZTBtKgFSc5JzYrU/V4BX0ygyWqyxVGA5L7IrjUV7HtLhE3cmqSVyjulg2GHwnygWzmo9GphA79RCJlv2tsP+MnjH0pPEEfikbCEFTbXkqka66QN8Ya6mwg8kbmo+OnoJdIbam9kJnHHibfB1UIXYpG6B4n4pC7u2uXM5GLbvi6C3hCeyYwoDDpCm+8sGx9vCL8ExmhlEIWcPCImiUjdNAN8N4F/q7p4b+ZOgm91IfwFAW+7SbEL8UhYMq+PqfAZtVPmLZKQUG/kxyZVLV45rYfHpkd2vRNLIfBiSWm1nrmewCeXUxAtyZFLw7HZOTXkqjskPUCIcZoPvvFtqt9xo+nX2yQ5U+by6912+4FYZkf28ZtgfLblgJW1iyaPdgzTC+utihprO4sVuouYr81qNY4Cjn49uxNgSE+sfoSu/bLq9pJ0b8uI2IotO5WVL0g0hEl5Oa8GbT3s3X1SeC9AWZxTg44b4oDe9lMuevaVGBGmdVZUTfjs9GHisbKlqNWhKE9IVQ4Bb7j1i/En0pKqcA4I5zk0npPKp2JOyIB96zuGnHPrq+WMnvWgKNsvhofZqEuMD7koNwRJwjTrnsfF62sPBJFoS1zqJp1dzGkYMGCBeEkYtH802WJbGpSoD08wqCjvLhysJVOOrZn1hvDhzMXw0QqDsN/UppSjQpugN4SlJnqfgYrht9mZW5S6uP6MwV8aXZ0HOjVJi9eHLwLhYhA+5c1XHuCkIGoyq772GoXoSkVRGhofWuhYmqWfXPcLNnhGgY2LpjUvusMa6EUsUpcg8KkK8xg340woJbK+xEAimkyJvokjeqRuGRN/pzWlRlsnbYhFau8g0Dlk4HiXpnumxL7EFAdaZz08PDYFUikhCegSAnddlHsyas6Xg9sL37WJ7lCuMejaVqNbAwJXlVP7FA8CEb0E0ANuYYPA3MwQbmeRERgAnzLWTatCqNbTLxKoNjcgsC0mk0jD22KGQkCcyDXWOHptiwquFXgDxCMUwgmZxpBUfzpSraefIGArIuSdwkH+ePr3IJzAjE/zA4OHOL1PySdhkiRaXMvMN7NiTHASHROKWh1ELzDjLSJ8k1NDjq1K/In0OWD8XipB82qNU66IzMnFDeuAPY7+pn3BExvDK20ZHvLhyEIn1rBjI7f1RFxVxe51J9cOv+T4nba50WC+fWpzq2NVhhCL1D6hEO1rMM51qmCRZm6dBeVlAioJNNXNezKrIby9wvgnAUMMhSZEy+hVFLUyCFONAu0/9eEWRxGYWH14Egj3KqBOg/jAaFOqGErqTaI+PMkgSN+VtTB4f21+q5XrYke8YfRpYEXCUb92qziJN4xuACsPMvMdrhU8kdpfMOhaMM5wkzcX7j2xdlhlBX1UStB1rIoR4pGw7HgCWjK1nXXShlh9+OdE+B0RfqI2pRy7LpZkeKUUzutO6+Gx6ZFKOhGMFEXjsqFXk2o9/TGBOnNq0FHAUaiOp6Mi883MV+fVGkevacmD8C6IXs81Bl29pv5EWqTId2GlYr/8lGrHRVfw622zAZpc8PHY5WfUOEoVDJ/TtpuvQAsAejWnBl3Vuv16WtaO0cz4WV4LOVY3ClK2C9AuYKOSh1YeaCe+Vh3PXEZknAco7Z2VVQc7eS9Kial/YvguICrczeAp+UZnXZWSgSbVlR8RaJvcgNcPwuTJtgZNSRl1rsgauPWA6VVOK+1MHAs4/g0sw0OMDakDFuPD7U2sD1LZUOxj8osJO3TuvPXA+Wq5vibd0uUREN2mNbXYtuYVVVIGv8SELUD0G62pRRJdHIk3hCVBaEc2jOnR5kUiEeyIyIET6CYmnOPWpG3WybX7KYZY6FBY4UOjD9knXvZ4nE86/7p5ZYSZk+p29hVYOi7O1ZIpxxhrqQeNqOmJxLpjSKykKfIIMW5Qm1NSOueKHgnnmfhTranVNetcwiYiNqesopGNT9mHwQQ9UnsKgx5kppuizS2OFUHCYdtvffWzH3/xK1GlBVBlDXh4eGwKpHpCFnoJRZSVQhf8ettrAO3cRStCnzaOcQzXFhVMfcpLgJLIqQHHUExpgVzCwGd5NeSaPF9S5jyMFDreTddCqNYzvybCrxnK6flGv+OcX/1Afmvq7FrM4E/zao3r6/v19IMMTCDgTznVWfRMKIasiI8AI8hG4aB8dGSfTak/kdbAxWR6xcc8Ia3V2MoPBGJLj2bF94iPfA0F7roBBt2Wi4YclUYFfzz9FAHfMWGPglE4yEnxNKBn9mbwq8S8MKvVuCpMb3fPkic/OXsXERgVZIPomqS7nliGhxgb4j0Q48O1PGg9kOcoek0u3G/Eu7e+tsx1MdMjtb9m0HQiPK42paZZAz0QfYx4JPy8AhoBGDG3/ANBj9TdD/DhINygNqVc2x3H6kcfTaQ8BsatWnPKLAPuQzH/BBUixz6Q2TjXyZgRcTSjoMjjBjHTudHmFtvHmRTLYX1V4sL8l5ZscRJTG3RfZNetK8jXAoM+cJMjv/e02mGVa2kpwI9pyday32U8UtcK8GCbapN1KJUt/1Qh49jGpkWOrsZSI79/EDBXTaaKni8npMT5Xx/SVze9slSs6vXqlunh4bFBiGCihEok9OrYtdrEr6dFYbneIB7zSeMIx3BtcGa62qjA+wS8mlVDrl5Tv56WqonNOlat3MmpB4ngj6djIJoMGOfl1BpX+QF/rG0SfPRXZlyTV0OykXHEr2ekQVzZ16/WM7cROEJAc1YN/dga6MuW/ng6CmLpV1PDBp+Yj/btgeKPLzsOpDwEUKXCfGhGC9luSAOJzHhmfpYZpxNBXvf1XLn/k+SLgIaC+TjDwEFOlUGl0l1pINrBKPbKcSzKqNbb7kVXIZqftr1soIWNYR8IluFhurvnmd6KDUByRczduFjWjsqgeiQ8nYHfEvCBmkw5Zh7HI2F5X2NBeKJcVUip6dy5xJijNqdchV1KGhwfEOEptSnlmNsy4+CDK0YM+erVZStWj7z6+Q+HcncypLgc5f8nn5t0ejx91JAhW1x1sF/ie0EQbnExekSERcIpF8cj4fPFsIomUztYo98jX5DE6M7femDVwB/vE/pir34YcaxLgmw8Ehahr0y5ihwh3hCWuvXdy6qN1teeQ0R3Sb6K1pRyrDGPTRo9nAqKTD5vlks6FWKR8EeLP19FN768VCTWRVRHsQY9PDw2BZIfJ60PZKftutvvrvagy8Fdp+a07Z2VQeeyL9CeyTLRp7nGoMhhO+LX09L+oo6Yds9Gg44NLAOJtquZSQoSriknEBa8+4MdjP79Fn3712tbVz52t1TqSDhEduYyr0heoZS99gewl1/PvAbmMWVevzg/D5708283P+Hcp3ONNU6LrRhYJw06PLqmK/Ov8wfsc+K3Aw+dcnleDUmy7DoEY+m9DFGsBgwCTXEqba2enduZjMIzAF8FkHQ3L2TVkO2G3KQ63naDKHsDPIqIfp5tDNqmKhRVWQds+y4zj2LwPk6aHkK3QBv9Bmu+uyA3fRepVBU2RiqGYBkeYmxIiGRjuFKkMsbsSipfjPR/6YN+cvgkNvAXZnxRSbTfGckW24ShUtOz48F4S2tOub63WKR2CoH+xIwXos3OhoRJrD68nBRktSZnD4IgGiBg3vvt/Mrn/vhGmyhvSvazqdAqF4VcaPffcdzo/oP6K2PZQHPU3egRVcDXTtxl26WR3YZtxYZvpEO/Fik7WnjRfiMW3/Lasl226l9594o1ndKox5Z4JCxf5pZqmYocId4QfgCMSBfTnme6CITNrB9zgI+MF8B0r9bc4tgAau6kSb72wpKMfJ9ac0ouLFdikfBTCmFPtSklGdLmD0DadIsR5+HhsWmQ8LBo+chv3lFwsDq+NErku48N/m0+WiNtMBzx62nJpdg8p4aC1kkb/Im2h8DUQEQHZxuDsgjbEoi3nc1EN4N5dk6rcZxzTPx6WgTM3supIVm/xKCSKj+pQBGDQzZ0kkNxr19PSxloRGFMcPI2CFs1XnPTisRVlwyeeGH629Nv2d4h8VPmqqwyaIsvt7v93Z2/nv3Lz9e8+1yh8FVe1LrXYbv78zVKV0E8EP0IuDKrBm1FJre99+NhlVUVzxD4PiYaxsDYfJn+N/5E24UwFBXEawncnHUpcfbrbU8DdCAzJue1kGMD1epE+lRiPEAK3ZidEhTRNfP/vzGqXgXL8JBdtSSOSFjgNGv4hyFCZKb6qdz2kQ8v5SrIF/8dEU9Qm1ptS5NKnV5FsGSpliw2KOsjNWtSamYmIY6WZXWpsW59RYRS2WzZEEOsvvZWIpLk22d7ta5fx/DQ68N/ePi9zzQGPmz+16diScvFLsaHhA9Ex1/K18aJPllp7LXTwtsZq7oKDY8u/kweJwaaXDTrlInFG8LNc1PLJz714RdfdRksnXFtmxvF68OPibjMQJ+xtZsirBCrr72RiC4BGZO0pkWOGv/3TRo9pKKgyPt+xU09VSg1iBOBMNfJR5BSZDBfTD4coM5LSUWQ5LcIrt2MPTw8NhhZ8KV1usy5srHpQ3Wi7QAy6EVROc5pztUeQkBPiyEztquwdtTyqTs6Kpj69bSoXl5gKDT1kylBx2T3okCXgr+C8GSuMVRWU6po9DD65bRQb49xT8PjY7+euXXlY3dd0JVZPGv1a81SqWE7Pw86rHHZwH1OuuDzaxsGVAypvrrrq7wYM9KRtc/8TP0GtvLa1aMrdxi3QvEpX699/y1ZJ9bpA1N991sD0X+blwjKtgTjDifDYPRcrvq6PfMsg55RgK+YMK2ysNnBy6Jb2W1Ii0jyKRS+BaCFCvCBWzioGDYBJhPTz3NayDE/MphI72kw3gBjXk4LmbaArKViJ2wMgVHBMjzkBWRB3BhZq1I2aerxi3W0jmVVyoH4J4ChCiuHNDYvLPZO6U28vq4RZNwM0IrOLj7grEdabTN/BUk8NaiYnIkK0B5O3hOTeCQsF9G+Vf2qRp7+lwWOIjCx+rpLifhCJk5Fm1p79xiwDI9YQ3jLr1Z3XnrJE0uGMRfDL/KZitUtnhSp/pCEVXFryqJcPX3vYMPd/8xMG7fd4Pvf/uRbcQuKQSEXxjrEIuFbXk+vuOC+BVk2uGhhy/P0EZnRI+HbGDiPC3RI9GH36p14Q+25xHSHwbgiWkY2viRx/qWWTNlOUCYiEMagWoU7d3ATchPiDbVy8T/I4Cu1ZKt8hpLgZsaORTDNcfLy8PDYYGR+kFwyKU/tk39XM3vZdl0F5UMivJwt01elWs88QOBJULr2zE3Z3rHxWrFs08CtINzolqtQPTu3HxnGSwx+J6+GzF4hjnQ3PsOeOTU4xKb/iWV4BPS2E7q++vTG5RePrwCzVLDYzs9bNlw60VcTvk8ZuFnH59dExDsiOX9ioPWZnyVBtnPZsle/uPG0QOGLrGhdiCdckjDXSSj165lHCTwa4Ieyao1jor0/kX4EzCL38Aqg3GGQ7+BPGqsdc2oCicwEZpbGnM0MKuTUoKRL2OKPt10BInntO920UobHlo7wKb4Ug97Oq8GeCtfi8ZAw+MZoIitYhocYG2KFivHhmhC4HsibM7NgJWl1HT2KeH3dOyCuBXiilmztIyErxOprjyAi8ZR8xwUcGH04Ze6IbSmVeO5OhrK/On+hGDWO6A3hewzGNIVxgNqckovTllgkLK2BRSMjV9Hevt8Zj39o6tWbFA2PfYJb/PmcvWpOY/A3Vz7z/k35b9fK/190TMRFJd4aCSPI6yyX5kzxibWrP1zR/pdrXvxIvkgJb0mil/zI0tYzF0NRo89jQ7mZQNepyRYJ5UhsVuKXUkdt6YHMaqg9V2G6k8E/iSZbXTskzjy59kifQY8DfLeWbHWVvo031L1DzMPUZMq1AZTeUNvETMcrzLuX0wqRnBqjYHwEcHM02Wpa06IlYMZaxfskP2APD49Ng2l4yLwkHth18OttnxIok1VDruHnkujYZYqB0zPRkGMCvSVxzvxgVnNWRe0hELai3TdozFdnDO09365DtZ65h8BRH/M+aa1G9J96UzQ8tr7gz+f22+vY28B8f06rkYoeWR/6zs+K74ut1Gv7Dzz49Ipv59/6y5XNN9/kNj/7E+mnVj16x/COjxeG1qRefIE72mWTLd4k8cwXCejpmQb4EAX0vFuehl/PJAA2mPleUpQXADoq1xhwzI0slSKLp+klgAO5pR8fjBmH2IaoSwJtImfwWE4NOaYqbHPHos2qNtv8fYC+yanB3s1bpeJQPEPy+R1hnf3hWIaHXBCzSxocjkIu64lZriXIf9RKStIbwvPBOJKJpmlNLeJd6UO8YcxoGMZrIGwGhY7UHnJW5RTikdq/ABRhwinRppQktjpS8mBcT8B5ajIl7jNb4pHwQVSMhfKXBlXsF2161y4JqWh4TB3n54NGDOlgGAdGk4vE0JKcBSm7kkQcubDFrSWfgxgF2/xk31BBRHP++FqbXNDy2YjrSn4k8oUWrXb95PAxbIh8Pd/fQ45cfizyXBKOKF5kpZDVK2C+V2tudY2FJuprdy0QvUPET2tNrWYOji2xSPhvBBzaCdrpLBfvkR6pvY1BPwboJC3Z4hgzNCklvma1ZKrnbkbUE6UvjSAJu32aKHl4eGw0xMMsifyih7FOS4pitQnBl2vsE7ZYh0AicxYzS4L9jJwa+q010Ivq2cvGKYbyhgG8nldDjj2itp/71RZr21cuBGNL8il7ZqcE7RSOLfx6uthYkhQ6KzvFPl/CNDyG/f4Vo2Kb4HM5tUbm1+vt5mffkOqpvHb1PcZ3X/s2O+6821f9/U7ZgEvY3nZ+Fq0QXrtm2PKLxh9eucPYy9e2PC9GipQnyyZK5ufV1YnMdaLcSuB3s2rIMd+wWm+7TQGFlAJfXPApL5CCK7IuoaitZ36+eb/KdpFilzVpT/iUg50E1apntx1BBj1OoDezatC123Agnl7EwDb9Bnbu+PHkHXqH86WYQaQOZPO7oaqlgmV4iLEh7YLF+BAlyQ3BLNcSxHtSzLCVHAgmnMvMF0ebW23rke88LrzVwH4QxdJhIDrXyTgxSdTXXWkQXwnCpVpTylHBU7gvUntcBUjyT27VkqmLrIFeSOt6KPQPMIawz1l4bPN+vntXri2cecaY6o4jth86WW1OSYhBHnu2xBRLBphc2PKlPa3uEax64aMv3tt5m0HLn/rgC3GLyYUtPyBxY5mN9f50X8OYsRVsvPHFd51vXfLkErngxVqVemz5XqTL4Fny+nr9LkOZKpcS4XW1yV306+7Irtv144pFIHzUa9HvQyls82NmPjLa3NqnJMxkVkP4IkVU7wiXRp2rdyyKuirM1VqytbcHRZKxzB+OZMQ7umw9PDw2GNEBkj4n4iWwvBp+PS3z7g45NbitTdjCYrt4+iCF8AKDYnk16LiLD/4lXW10UIts3nJqyF10TE+/SaCxrCgH5af4ZV50xJ/IHgo2nibwn7JqjaOAIlX1b+WONaO3ueaJ9z+/6mh5ffHy2M7Pw294PqpsMWzkp784DIWvPpGQioTibefnkuLonrxmVd0n54+p5K5O2RiKV98MmU8oGUaXALRs+JrAhAXTSTwGfQgkMlcz84SOAf2Pr2pf8ywrmJefEnJU9xb8iczfYBhrQMrRCvHBTg3tSgqmIoT5JXXS2OyZwa+swV749YxssscbVDHOIbwjFY/9Qb5XA/rS2ux6dC8ug2V4mLLVYny4JhOtB2bWtCDPO7tUNivVKb/XmluvKo31QY/UPcHg3Rl0fTTZYttUxyTWUHcCMTcBdJ+WbHENG8Qadt0RXJFSCE+4lc2KrgR9u/mbBIwwGFOjzSkp47Xj8K0HVD76RXtn/60GVH68or1TQlWSFCk/ZgkViOdIYmkSSpIdxt5n7xWc8Fbum80X5b/dfW23QSaVMaJCJ0ZQMZRU5x90wsXjtxf33udaMiWxSInDDiolN0kuinwmRQGfeCTcBsYqrbmMbLk2or/y7eAlBgxEk63F3gxOxOvD54PkR8aXa8lWSQazZVZ97fEK0aMiqlOu068g3W6Z+CRSlFHqvIW9200PK4WhBInJOqrGenh4bDCyoMruVxas4iYkNKdt/0KBniLQTq7t4GdnRrHBLYRi/ofzZmfuXJ+/fR9ZwIZUKEa4bcoI8XTa4tfTDwN8tKLQKZkpIVePdTH/xFA+APMLOa3GMclR2XKbnxgrV9yKQhcp/Qf8xVjTfrkUEtjNz4OOOjNY+Dy9S9WOe7z47V+vkzlczksEoM/8POSCu/48YK9jDwZTBZNxT14dIYmmYnxJAzYpub01oGeCDONPAH1ZaRQOWBYdac5t6+BPZC8EG9FCYe3hFb5+9zIbH+e0EY46UkL1/2PvzaOcqLP3/3sr6WYVXBAklaQBFcXuCiqbqCiouIskLagIqQouKO5+XMYdHXWcUWdGR8dxgVQFcAE7jes4Oi4o4zbj1mncxc5SQcVlxGHtTt3fudVJvkDXu9KMzO+vvM6ZM5xOTtudTqru+97nPo+RfQjB8iHgoZZFM/MxZxfT4OL0LoUO5HvHAAlhXDYaFG4tynr6cUCcBmgdZUaHiMY7fM/pXTts5Obdb3yGc2VcV6a7Qbnw4DY+V2wcEuOa09ENSqppRkuE67+0UHodgBJuKaZ6o3Ivu5cSYiLWlBL5xtssOLl+P8kjvU8Ay2PJVElP4khiVqiPtc5qA8R0pbXZzs0QGguEN2rN4g6KHlYWAsJEIDK2KaT4zc3aDVYi71q0mq3VI6Hnvlu/ef/BvXvVn5F8Xxj8pkcUbtftYnm89bOXvs8iS/5evBqbL3ZOis8L8c15WG9PgTNlXDdYWKsBljXMi1K9m+jWiNRPIpBeLhZydlfFCSM8cjihxYKr57RkquJOd7ErdQsCThNY3O9WLKoY7pQ5usFWqVJlh1AqPFgXV9Hrp4Td4vdu4NiHvKkGXW88spF+HQHHFcg7frXmc9Jf2PiMzJ/Qvt/Q/5lqnXD0XUI2MrbY3VSDrmJ3OZH9AIiGe4jGbOMMutX12Xf/yhuBrDD26feGqdZxcSK8NvuN7EwCug0QPyfL+ldes5/P8Pfja9iawYnMMUjAY+qfPVQzIaMNdnYlTWRnkEV3ALZPAqrhwmbnLTZIHJGNzM1IMJEQBiHSnbloXZdlhBK2VwrCaAsKJ66ODhWaPcqJzJ1AdKFk4ZxszDEgrgTrbXaqravftDm9kv1QfinlwoOLDRYwcvEhtLrtJuXCY0CfmsvuPGZfngG+qSVTQlGKHg5dDkhXANDzbsUJw2Fy/Xv1+ooA/q0lUxWd94o3856V02a58IFpQPAXrTklTCnUww23ACIXai9ss17rSDyiLEaAGSThYaKxDaOHldcAYSwijRWtFzNFM7UphQ4MnflUC/9uQorbO0chwSFuQtqHwg0jahDfA4R/aE12p8WRRWfs1a9jfa82QPhES6YqxlInGpXjLf4gulu39y9eCBhWTAs/KFWqVPnF2NqHoshyXPmrFZB1W//R01SDfB0VjmJkPfMoIDQSehrzUdnxRM50Jq4ix2Pc7bZpUUI20u8Bgc9sC/pgHgqtEnxG5m8IcBQBHZNXbTGpI/5E9koiuohzTdz0J4wvnp6MEjyLnaP6jTk12GXz02e0HYDAB2zojYiTRD4lpeRYAmsSWHAEIh5hqsGyINUJWc+cRwjnI9BaAPyrm66m0+KdjgfCi91yZXwLsxcgFz+SdIc5yy/cNGKwR+8O2rTeA8DZNuR6eO8m5cKDb6Dzi8WHcG7XTcqFx8w/HN/gAAAgAElEQVT9fT8dOWzXtliyVVghFyPu40DwvtacKnVKhOgR5T0ACpDl3VtgulVGjyjL2ZmzvUDD3dZx9UjD1UBwGSE2xZIpoUFXPKycjQi/QYAPu+nMeTMCXAVAc7VkK7++juhhhcPhTgWLjtOWtToarjF6JHQbj0EQ8FRB96CMEQkliFfdkFStqbUs8N2W+NT9d0apwG3RtVoy5TqL1SMKW7G3a8nWiuFSS6bV77q+IGUR8Xm1qUWY//Pro/c54voXPi0JiHlvX3ixqlKlyi9muwsPn5HmG2qoo6bncFGgGSMn0rfxDQ8k6XJzll/oFSEn0tPAgoV8vc2rwYpblP5EZhlZdKwEWJ/VgsKwTdnI8P3rNAQ8J6cGeJziSGdeCt4JQD92YO0h30T3EOZO+RdlFSoQb5o8B0BDzGjgMMCtNTB+IysTEOfZ7IZUUHPaEEdvJH88q3AaLhLOAYRdCOgK70ZrYnqOeBTVGeYGcQR4hwhWmVpQKCuQ9cwtIMFcsKzfm9qQW8oPbINfb2skRC4QHzOjda6aTp+e+evXcxuOsdav5TqhiyD5v6RceHCxwepgvjmeVX74v6NceMwI+X58pCXPIwdH4pH6MQh2rklm/SYYPffZ1I/lBx0wIkqSAE6wPNYBs5euFCYPMnpE4TfeaR0ojTmr6UOhNaztFyIRz+T+oTW1HF9+YBuKK76s2UjXbIKxZ1T4WfXG0Ok8igHEu7WmlivKD2xDsZi4zAK8YHayRaTQ5kyZ0xClRQhwm5pMuVaoxe95AVveas0trmIldjvlsWChw1t/5lPv80jHkU5xKAR7eyx/pfEOo0cUnhV/rSVTwjfqwsiIwRsKns/OebKV9+AZFt26FlRVqlT5RZQKDx7X8v+74jMyjyDANAQclVMDwk6sP5E9kwh4bfVBUwsKxfu2ORnZAZqvVTrpM34jewcBXUZIU92SWX2J7A1IdAUQ3WZqdbxx6IjfyB5HQM1AsBEJJ+RiAaFVwx5LVu/u3dj+KlnwDkg4icBzWD7q22qttn7JytqfNvZbQUTDUJKuyc3yO4aMDkp8PbAGNr9iEdyHkpQGix6lQmFifrY44r4Y5racCJ4HBMqrQeFoW07kziUq/FYiXJrTgsJ7eNH/4xUAesVU61wPz8U13xnm7GHroNDBY6rtGs+5UC48eKbPLxjPjVj1+0soFx6SBBdYlu2F0QV2xfR0SClE2EkiGlfJA0KPKGx2dQV4cKq21H1104goNxOLhCSIak+II+ET4dARFsILBFZr+ocBo+e9+qrjLjTrGiy03kGe56E0Xmv60HF2V0KP1B8CIL2OSM1qU6vwtB+fqmgo2cJR3rQpzQy7oE9TRkHBvlA0a8mU0CiGMRpDFxPQzUC4uKLoNqI8iwDHF0iacKbAyI0pPm+iVaB9Zz/ZWtFnIx5ROIRoDy2Z6mIfXCJxdKiP1Ze+aLdozdnLWkvWzSzqEv69qlSp8ovh7RXudFQsPIon6GvIKpyR14YKNwxlI30iADYTwLN5l9XRgJ7Zs4DwHgLmza/89W4jE0ZekFbBiw8Dwc1u4wV/In02Ef6BAB/JqwHh/as4DuHrXE8gOtrU6lytGmQjzWLLDABGiWhCXqvjjaCtkPX0U4DI44d73dJrZT3zCiIuL3g9T0uFwqtgFU4ztSGOPlaMb4EZQG+BOy3vA8HgnXutnbRyer3jgc+nZ6Yg8uovvV5cG3Zki02Xr0w1KLTLZ/xG+ncE7G5Nqhmt463FAdvTJatAufDgPxbfAB2dMbeTLcWlbOHK66Bd0MPKK4AwwSI8enZzi0hNa2NMbZhJEvLGzQ1aMiVsITELT1HOKFiQQIBb3ToD86eE9vF4iSu4nwsd3jGi0z5rSnbq3es9iWC4RXS824opk5gWGmoViLsIn7qtrupTQ0eCRC+yNa1bBs0jUxoGtdfgx2TBKrdUWoa7N4h0nwXwWiyZKtnWO1LMwDmLgM6NJVt5jdqReFh5EBHO9Eh05KwnWisKP43GUBMRHVvTE/xnPCLuCsXDyieI0O+NdKruwXfLNsS2/Xzx31WqVNnxdKvjISfSswDQQMKbcmpAmAY+OJEZ7SF7zPBhzsVtdFDiwz4e2nUlEvX2eqyRbpsujG9B28HokVYQweN5F+FlcRSxhBBfzkcDwlgHu+NAm94ixF3JgvPyWlBYSDF+I/NI0Sd8AlsG5KNdTdJ8evpu5I0QgEdNNSjM5mLdBRujQbt0K9RarxLAbU5BcmWWkEden1mOKH1LQA0IOEm0bTRYT4+SEN5Ews9zdYGRMAkdD88DH/lmkLd94wcIQLRxYyg/Zx+hY7ed/0ISj6JuKBZTPIravVi0uvqBdJNy4cHFBntrcPEh1Dh0ky0Lj4uLq0ZbEQ8rdyHCHCC4UGtOCQUwTLxR2RcJWoDgca055WpuZjSOPIDI4mLiMS2ZErrk8aZLYZ29FjaYLOvg2LKVvHrkiB5RnrELJAsvmt3c4hrN3LlBQx/zAHDQhg17i1JkeSvH45H+xda0WrKF98uF2OJYgr4DN24YJvp+DK8Xg71eDB9pydQB/AYrP7gN8UjDhQh4K6J1n9q0UiT6hAWRhqslFoAhnKs1pRxbiFsSDyu3I8IVKMGJ6hMpts53RI+EVgDQKEJPqGjOVsoCsA19yk+sUqXKjob1GnzNKa/TbovPMA+QoPA2ET3qltUiL8r5oWDxGHtDj43tyqo5XYynyvj1zDvENxyPNM6c5Xf16hm8eFWdp8PbQgCfmGpQeMLm4gQ80msIsLLSposvkXkNLRrOGr2cWse+HELkRIYD6vYGwgE8lslrdb8rP1ik6NVxNS9EmGqd8L7kS2TvRgC/ueqLU+Whe/LBjR1EhZ0RRjaySwCsPgB4MHilSeYZfsf705D4V3tsRukDRJTAIx0oMhKz04M3ZlvIgiEeoLHbbPpsRWBhZqplYRMi3J+LBkpJ8LwSzLYHLIsQpshvB/y34iII2PWSo2/5ou/anu8GWxYePOvbyo8jEVamWUgJ9qPXki2Xlx9wYMk08KwvKN8C0EdaspXNs4TYJlng/RQB3lM7A+WE6JGG1wGk8SBZx2tPiMWc8UblLiReNaY7i7kiruiREAtf9waL9teWtTqKoBafoOzS3oOzSWhtJZGmEQm9ZAEdAgj7x5pSW2UAbEkxQZZd5b7zAo5xX5u1xbwJQngh5uJpkgg3RCzEJkK6I9bUKswYKFFMBk4A4DVaskX4WumNDZxQOYUIp8SaW54vfrmUBcCnhopmZFWqVPmv4esEXx8dhYL+JdlesJFWE+G7phoQawCIUE7kPmKhv4XWmNXRIcJRuS+RaUaCKURwXF4LCq+3Nq+Q15fJfIYo1WJP2Ds3PcDmVV0oeopw639D++aOA789exh7TfBhi826thpJyEZ2IQDxqr5RaYPGl8heiUQRQPqO1v9nVf7cej5wbeWD4V+YbaSClQAJ3zGjwZJZZhc4Wp7W/XzimssOu2TgA+9dQQT5vFrn6ntU7KKMBITxZMFJbq+XbGS4gNtXQjhEZCTG+HTunsAEQOkoNyt2u3siSW+RRc/ktSAH3pXg7tQeRU8q1/twNykXHlxssBaDi4/zyw//dwgLD7btthDZGvcVrdndbZMprsJ6tGSKrWhd0SNKBgnWq80pDh0TYkSUxQQwFZHmqE2tQuWz0ahcQAS/JoDH3TZdShgR5VkCOD7+gfl/y1f9wG9u1jdwpgq3prhVyS25n/SwshKRBiJJ9dHmFqGa2ggrDxJCDCWY4tY9WDStfr+Ogr3G1U9CPDTa1MItVEeK2pPXEPAjNdkinPHNnxbax1PgjhA2q8kWTi525eFwqMGL9C4RPBprTvGqsSN6OMTmZBoiXq0mW/i9VqKUBcCeKLxiV6VKlf8NPCoumRN2CYmTjUyafShyapBDLYX4EtnnkWhyJa2ErGf4IDEXJDrbjNYJR7olZCPDnk9jPQQHik7mey36vt9Ga937RDD4x4cuvWD9iiY2UeQREm9Psq9TWQDpT2R/S5Y1kxCey6t1Qn8iRl6Yi4JVuJkA3wKijrxWxwchXsktXysD8cyYgoRvINLntME7Oj/Hx15NXfAbWR5jX7X+tYXhtU/++eU97nrrVVMNTC8/wQG/kb6KiJPikZNsr8xpQ4R6N9nIPotAR1kWnSIyEmNkI8OGlCcRwZlu4yVfIh8Eam9FgFZTrdvWKoHHPOw4zaJg19XjblIuPLjYYC0GFx+l9sp/S6miZrYqPPRG222zvXuFRMPLiLj/xrbaQXPefdfRcrZEsdPgl/rg0OjCFtvZ0wleb5X4Z0K4UXWx+dYjDScAII8tXnfzHylhRJS/EDu+Is7WmlrYhIZbaVwps108fwjYv/8lI6K8RACHVPLqiEdClyDQb4DweretFN4K6QDvCgmACxk12vzhVoF8W1KygicALyEcOLspxbbBXbDdW3/aKQ9AK7Vm9y4TY3elLGUNWdASaxZ3mvRG5QYguAgQF2tNLTyC25JSFsC8YpFWpUqV/w2l9HC+/mw1nvAZmX8BkJxX6zixVYjfyN5DSGcB0By3YsK/MHcOFax7KqXSlpCNDJtYnU4E0/JaULhAIBvZN9lPYm3iuht/finBRRQfYkv3CP7d7E5q0SvkWiB6x83plGHzL8mCJ0GCx5Fgj6IzK4elcfFhb4kMSnwxsIZqPyRAT8cPnx70zaVH8SpwF9GrrOdOQLQesSTvpA2vPXrupo/fOn79UUuCbmJaW1ND0q2E9DMCPWRG64TO3f5E5l4i0BDp0gpGYncB4NkI1vVu4yXuctF6+gIQ1plq0KkLXyo8eFQk7PBsB+XCg0WgrMXgIDPXVlA34Oq3FCRTLjyKN92xXsARbqMAxggr8wlhFiKNdrtBM8VOwxFb6AUcWRAOqRLS/ewZEku2Crs6C6bV7ycVJG5bpTcNqA3NebBS0aNcCQg3WAS3z+4UvvJryZUh/978R+JC7kE9Enro4zX/mfVa+odfv5n5N68Yc5HHrzcXNmyExsY8//L165m47ai9jyTER2JNLcLuARcIsLbfqwhUx456bsm0D5w0qnePms3cltybiE50E8jqEYULEi4OXT09SugRhQOdCm7PtwsppGuA4F0tmXISgHFniGOo+fW7vvzVKlWq7Gj4hs4hkdxNKHc1OmPZ4Yife2Fw7XRxrofPyJ6FYP0JUfpdLhoQGi36DPMohMLfEPHRXDQg1NuV8BnpqxCl68gq3JTXhggPW7KR5QPhZLDoIjMW5IRZDmjrcvPtP/Omq7Cmx0308w9r1j3/4MyO//ybb54sEOVFCr7O8CGHi5RBg277W2Ltk/e9Ju20q20tsOEfTYutDT9zwcGdbj7IcnEV6D/j+hUd5hf+/lMvOix/6Xi+bnNngO+XHHLJwvhd+0yc8dXO2u33/fDwFffX9N+l/6b0x7Ostd+d355ZycsRjsh67khA66/2BgvQ393GQf5E+iIC6Vaw6G5TCwrjR2Q9cykg3gRID5rRoKukQTYyvFI8qMYqDG+LDXXyxuL7NXfwX5aN9C6mWtcl1Xg7KRce/OJxRcTFx7an0e2FZ1KlLgELcP4Qjyh/QIBLJJImRF3WNhk9HLoWkG6xCLVKYk69MXQ/EJ2LCJPVppTQpU4/JXQkWPQCID6rNbWwSZUjS6aN77W+8B/2B+lXA94D3ezNmaKugQW5j2vJVMlqnv/I/MHhkQd/4E7Qw8ou2bUbrzE+yK/44vt1/Ppy4cOCXh5LcZeAuy8po3Hk+++aP75zoK/f21qytYLotIHXuBoIYEkli/licTaGiG4QBfQxeqThHQCs05IpFhJVxGhU/sHWxGqylRXPjsTDDbMRkS8O3xU6No8+86lPfy4/+P/gdmWvYuIvX0yqVKnyv4G7ojy/5+tcOedJNjIdBbAmf60O4Y61I50eEBwCSktNNSgcwQ5OtI2QSHqPTa9yFVxBGdtCnOghQHjCjAbFYlYj/UdebUWk3+WidTyGYE8Nzp/a6jq98wUPTtm4fPGy3f4vYX53p3reptZXudDi6/JzYBs62llZfKB9T+rd7/zB96fGrbk53KvvlIv61A4ddvjXFx3GDqUc+MajCX7+d7V7jfpywBWLdv36qsM/tv79LY+ouIBhK3F+jr1xKdX2vH3AvGcO2Jh65bmN7724+8BrnjjJPGdEjjat4+0hp+seDE7kR0jUwRqMTyzCT9zWgf1GNkxAjyJA0sk9tURn9wT/AgTPmFpQuDHJyEaa75sTCgU44OvZdSJvLLvwqBmqfDtw3rN9a6yCLChQuku58OCbIZ/QufgQJv51k1Irj7ksfoqSQ8tuX12tNqfYi0NIUfi4hAB/E0u2CKs+Rg83XA6ItwPhZVpzS5fNmRLFrZh3geDjyuuobFuOBxeIJpzpYjHOLGisP0YiD8/Zlm/hYso+9lxQ8OvIgt29xgb67TZ3TN0ZN7z0eTrz00auzPlDwh9+FkDx/I3Xqnr16+k98IKxwfN9O/VcP7B3/+HTl77pKKpijEZlPhFOAKK3K236xCPKX9irAxAfdzMyMxqVZUQwmTZae8aeW+kYbLQl8UjoMQSaaiHsJxrbLIiETvEAxQnBSwVrvMv2EIczcRgeF2zCn7FKlSq/GHYxZr0Z6+dc9XBb4kt8GUSq4S4Jb5AI13AHzP9kp57e3p8RwNpKqbSMP/7VRJI8LwPiW2Y0sK22oIzfyF5FYF2FiI/kokHuIu8NALxRw2Ps8gbfoETb0HWLblkp9d/Nu9PxF441Y37WG3KHma/nfJ9jk0jOj+Hia0r/WTfP7Ts59q81806aOeCGJ9mrg78Nj3t5hMO+HYf0mTjjZWrfOAFreixe9+qjLLRnbR53QfiQNLC4lHHf7tclz6odPvr1/DkjwoNu+Vtd4cfvYmtuncqHb8fNnGEPfNl/U8+a5YD4IwL9OxfdStC5FUUzsTeI6I28VlfSUHahaJD2NBK8kdOCwucxPiOzABFnIRWm5NQhQh1hMVjP37PhMNjt8sSJbv4j3aRceHCx8Ydi8SF0nesm/EPZDqD9ar3X33PiiGuB4Ck3rwqmKDzl4De2LXe10TXCDScS4lMIcK9bOuqSafV91xekTxGofWN7j/3mPP2uoxCIiUcUtqXlyvv0WHOrUCvBdK7tFt4AxFVtSkqZN89eB2V4LshVML/Jd5YQc9dOHNZ72C59lsSSLby7zCcM/pD0Lp7yufvA678rxsj935i854C+ew3q6erKGm9UbkeiRgApqyVbSiMtR4xIw40WILcA340lU8I3dTyi3IMA57P/htsYpkTRGfVqSaLG6BPOr5Xt9Crh80CwDglmqc2pJ8sPdsUOISq+B10TGqtUqfKL4E4Bn5Z5LO00z3fEZ2RW8dqm2dO/J0xH3kJzRE5kWgBwMHk9I/IzfEKvCMYfz+5NyPYHuA5QCpmq//vyg1vg0zMxQPgjAr5mqgHuXpTgTRr+XWxn6pr+vgN3v/utxI/3nrtfTV39hWub7uBxNhdaXHBwscKbPCwF4JHLsT32O6St39SLP8O+uxz0w33nv9NhfsbFBuvzuAvAN9trBt724jv/ee4vf+o18qjHvr/vPO5gl67d3K3mn4Wvq4NlIzOksO6nnTvaPrjxx/i1qUF3rJiT14J8EGU9I+tbumgPZSPzHAH0QSDvHhuDE9+dg45j/cD8jM/yQgoQ15iz/CO2tWwvwcJXS6IVQLBq597BkSuno6PhGCPrmesA4RpAusZNT8Jgba/vaPOG3by+vT/vyH/e7feMC+XCgy/2HIPOLX+hEUo3Kc0Q4ZSGQf8+cZ/d27Sm1i7q6S1ZMm2aZ731yRogSGnJlGtrLhEONVhIXLE+ryVTJ5cfcCAeUfiEPaQAHSPPSn4sHJsY4dAVhHQzIVwbcxGdMsa0kTIVLH4DU6HDe+AWxmN8Yuf5I3c7/rq4URn24Hvmp+pI31uzl9kiTb6psoiS9R9cmLC5Fhd5D9xz/IglS1d+fdyZo+QpWrJVWE3qkYb/Q5AuJKB28lgTYkvFnQm9UTkHCG5i45reXmvs9KUruavQBSMy8kIC6x4E6SI1+aFQJ1LCCIdUQooTwI2xZKqLsIpZ0Bga5yH6O0dDA8Dvttlg6UIvr2Rt6LD4fbgjNEZVqlQRwwJOHmdwl3LP8ldd6Nw0wZFUK9XnT5eFzsV+I/M8AU1CSxrtZkXO+J7O98YfOt4nxGEeoPGidVAWagJaSRa7O2gLeEuE71cs5O+7+/XLTq3d68DQvxPXzl/30kIepbCvCK+CcueCiwkes7PurkFOZAZ9e+0xWr9Tr/3PxrefWr7u9SXcxeCihJNmuZsx2bt74LIB1yw9ZsP7L/7zp8T1fJ3nsTrrOfi5LLRkV+oOz27yazudfPHP/1l6x7mD7n3vt19fOjZQ+GE1d295U49HNjcDwFYZN50R96QA4C4I64/Iqfs4GoQxspH5jFPLN1sFZU1sqOM1nzs9XpL+ybcl8HhGCT097O5V5jQk4Hw03dSC3JkXEkhkGvKXjGsp/LCar888qnI1puwm5cKD/3j8QnHx4SpE6QbNAGD7Q5zasMd/Hm/9mk+yruiNyiqyYHOswirsAycNH9Cjpgd7daxSXVxBGY64Z+2HBdbBseRK7io4Em9UjpcIniSABVoy5era+sA5o2p6fLeZBUjDEKXxqiADpqgV+XJju/Wfc59euWWFyDqGLUcoHiOs3MLJg+1E153d3CocGRUzZe4Egj4ewAmzki1Cj389EpoCSI8AkIcKJBxxsPaFLHpBArjPrXNUYn5jw2gP4VtEsEi0NlvsXLEj6w+I+LRaYWQWjzR8Nvfpj/fc0F5gH48dsc5dpUoVMXyT5rVSPoixPsKV4qbJLEQ8OBcNCFf1ZSPD3dtziOBYN++JErKReREADwK0ZpvROk7c7kLnCd42PPvOK1ljBG6nfE3d3W+kryfCaSjhDblogK+j3G1g0XoXfHr2SkRqpE0bLazt+ayp2SMhvvfxKMnuOgxa8NkwD0kfgrf2k3ynI+u2124Ww2+S9XSUOtpvAgkOk6Tae0iCNjMa5HFMqQvO99et3ET9ifRNBFKY03YR4AjXDBwju5yIxiF2jM2pwxyfNyjxdR8vtbMwNUAF6xC3/JfBCzMTJMs+/LKI1XVj0/9wdleqpU9XXzi6n/XTt7x1yNqXLTtO/y3lwoOLDRYA7ogZO4d82fkkgZ1635b9eb3rjWd7BI3FDYqayhH3tuj0HEI4KdaU4irNkdJ4p7trs0Wb90PRginqMrG3hh5R2HBmgLdX7+EzF7/NYwRHil2JOyXARVGXXBVjqnIcSXZB1y4hzog2tQj3tjl4TwJpOfGHBPEcranFMSnRLuJqe7QhwUtqhc4RU+z0fAKA/xSNeB6dcoBvk7eDTxY/IcKnapNzcVKC04MJoCGWTHHrkE8aO8I5t0qVKmJ4/MDXGu5cBMtfdcAfT/+KEG+10161gDBdW07kLgGgO6BgXWHG3Nv2jJzI/BkIprHoPBcNdHEFZQY/vKoOvd63UYJ+RNYheXWI4yGPkfU0uy9fBRLea0bFmx4MFwqA+GtCHtPgp/logH2DeOOPuymd2zzzSJKH5rgjhL1+2jj8i4v2dnSM9sezE8kDLwLhYQCWioD9cmpAKPpkZCM9h00WO1976QhT9QvFvL5EdhESzSCgo/NqnXB5QjbSbwBIYyWkE7LR4N/KD2xDZ1YOcVbO16Ya2BfAeWRTwmdkWhFwd1MLbgYif3GaUfFe0Q3Yb+V9Ljy4QmPhJxcfFV0qK1ASLzF8ehW22fWIwnP/yes2WsPOryBojEeUN5Fov0KhZoQoV4XRTwldDhb9BhEvV5tahLvLtl/F2p24bfajlkzxOqsr8YiySAI4mQgucrN51yMhVn2P6+iwRp711EoulBzhTgsSNCPgCjXZInQITDQ2jCbCVwjgB0L6TaxJvJWyKBLyd4Ad4WwB0MNaMuX4oWb0iLIaEEytyV1wyxQ7Pfxa/awlU7zb3oWinoZPMRu43VepkNPDykJAmO7xYGjW0hY+1fBmzI5IR65SpYoYHvmypo+vocIQR9vXglNRQfq9qfqF43fZyE0CsF4GhPvNqDiyvYSst10HiBcCYVLU5h8S/6pnu+ThscE+CNLJOTUgPOTJRloFwPs4pM5UA65Ce9/C9GS08Bk2E0MLNpqdGTDcueDuCBcXdodENjLsE1JveWuU1Wf4HEf0wcXfDCt0bFwBkucSLBTqSZIONaMuTq+dP+uJBPAYEnQAes4yVb8wiVs2cjcDWL8itM7LR4cIiz6fkUkiwDEo4Tm5WQGh4VjxNW0FogFWTc1I0e9VgvUnQHAMoWd0XpX5Ph0AgGVFTcsvpVx48MrQ7cXiw3U1sxuUxEsMv7Ecb5R6RPkTIMyFAh2nLRPbljN6RGEB4xTwwDhtaYr1HY5wXgkS8djk3liF0YHe2PA+EMqbPLV7z1n6rjBjgDEiDbdagOcj0G/drNP1cMNCQJyBBIeqLlsxRmNDiAg5cGe11AdDItOzhyMj6rzgZYtbbvFxMq3Q48LWyRQ+fhVI6ktIb7u5rXJHBgH7qsmWiq1WRo8oPF4aXOjYvKdgHZYLib8hEBBiwPJ4D5+99P015Qe3gc3EkGCeRdaMWPNKFnrx/JPV4TsiHblKlSpi+DDCXW0+6DkahXEGSLvk4RP/i6YaFJ5wfY+aAdxc+AQJXstpQSd/nq1gkSgi3AWIH5rRgNCIStYzL7B7KXnw0vysoPCQ54unWcDO/hcsOnXswpbwx7MKSWxuydES0i6mGmAhaRfkhB3oNg2swiFmbChfo7sy7xWvPHTPFUTWE4DSeono/A6rduLXswcLr3mcf4NQ4APWvwGkX5uqn7u7jviN9ExCKU4Ed+bVgDBLy29k/kRAKoJ0fU4NCA/ZjF/PLCeECRLBxKwW5FGLEFnP/QHQmrOF2ymvLXPhwfdhYdr6dsR2Ra8AACAASURBVFAuPLjY4BsqFx/CX7Sb8HpoydOCbyJdzF3ijcplSHAnWXhpbJm4K8HEw6E/ItIFCHiammwRVojFsckHhPBXtwwSRo+EngKgo6lCBgpjW6cD3QqEHDwn1IDojQ23AOHViDhbbRL7jzw8rX7XmoKHnVYHIuHYaHPLVjkAJdj0q2fN5peJwAsILVoyNbv8oANGo7KECIYAwo9ak9iOXg8rfyeE0VoytYtbkFwJPaJwUTjB48H9Zy1t4RW8LugRZSkB9EWig4nocJGmhFnYGGosEC1FgFu2SA8upR9WNR5VqvxvYfMsHn/zZ85xvC0bGROIvjW1OtelAFnPmCDh92Y0wBt7rgQSmWMsbtUTfF0obBr99ey9HW/SPj39EKJ0MgD90S1MrRjx/g4StOV6vxWC6dOFmza+R/IDoL3jVY6KAKR9gaRJThs0sp65BRB+hYjRXDTArtOO+I3sYgD6AQhfJaQHJISJ2WjQ8TrODHxo1aCaWu9r0Hktn+/2exV1LW8BWUtMbYhLKm/bFRJI1wHSX3LROm4cCJETGRaSTgOUzjOjfqHTLFMcBfGCBb/+JZlEyUCM7R+E/i3bAb+v2OfFLjb4xdgRBk588yi10LrEnMdPaYhIFj5BAHdryZTr6i5vcQAiW4ff6BY8Nn/KPjt5vLVtAPSFlmx13JkuoUcUu9WIEhzvloHC6I0N04GQxVXLBY6bNvGIoiHAfAS4dYubqSNGZ0DdKAvh1JiLVkNvDD3NbTFAWOtWSDDFdVjOhNm5vYMOPfup1q0U1CX0iMJ/i5kW4EGzXcSpJXjFWLIV8NaRanKl4yxSj4QeZpvlzsRLOs11K2dqw54k4UpESGpNqS1nobx2xxqPHWFgV6VKFTHcNeUtC77xDih/tYhsZN8DokGmFhSOYRjZSL9HBL58W9AP85yj2Et0dhusfxBgbwnw4JwaYE1FF/w6iy7xPEJ6zC1MLbg4vUuhHVsJQeqo6bH/tzMGOV7vSsh6+u+A0k9A1iGWRJOcAu0CCzOnWxYsApRuM6N+YWeZf0ZLwrEAdCuC9ApY1rFuWTWMnMi+BAR+AHrGVIPCsVXdwrbBHZbnUyL6IO/iwWGPlwj/TAjL8mrQ1XrCn0j/iiz8FSDcZapBxy3EEjwKQsAkATSb6lbGYyXLdC5aouWv/veUCw8uNlhkw8WHqxi0G5RmiAx3PvjGbfNQY0OohvCfQLCskq8HFyho4VIC/Ess2eK66VAUnaKWTLmuhxXFnPcj0q/UplbWswiZH6mf5AGJxxzva8nUtmtcZeKnhg7Cdk7tsxZryVah6x6jRxRuG3J8/c2a2wZLRFlAgPshUF+k9sPV5k+6VOcl9EjD1QA4AwBHINEE0Yin+LzbkFBTKzjCMuwBwjkHhNJFsaYPncdljcrvyQI+7fg9EtwVbUp16W5tiRFuWGMhfhZLpraNVubfj01+dsRWVZUqVcSU9Hy8zs+fuTL+RGYZER6F7RDMnSW2Tfcb2WUseLTaO0asPmuYq1bAvyS7K22gN4FoICGem1eDfGrugqxnzgO0uzEr3MY7jGxkeYNjuIQwzq3TwHQm01q7AuCxEsEkpzEDd086ED9AgieKug9H/EZ2JgHdCJ7CLCh4nkDEK906I4xspBcC4ThAeMNUg65ie9nIZgCs9aZaJ9zu9CfajieSniyOl1w1JT49czoiPAQET7v9Xoy8OLc/dlic5fW+g0FcKZ324eJG1C+F76fvcuHBSmCuhnZEVgaPa0qtHxb72AmwdlfCU5NDhHfVZKvrPE6fqoxCCd4igKe1ZCpSfsABPaLwjXZ4oWPzEJH+gGFvCYnoHwAU15Ktri+e3jiyHsni//4PSO0Him7886cc4PN6Oz4lgLcqiSnjkdA8BOJO0CNunR49ovwaEE8EoiGIdLhbVo3daUG4iQg8HoAro8mU44fACCsnE0IzIfw21pSqOEozGhtmEuACBLpbbWp13HLq/H2sIwGxgwiXx5ItnH0ghJOGEUBSkyl2HNwWvgjuvIM0RlWqVBFTisfgbbv+pS/KeuZOQLiUJM+x+Vmy0ERQNtruApQuxQIen4sF7DA2N2y9BsIIBLw3pwYcnauLVuCL2V3aVANjAMVhav5O063jKm2EMH4j/TsAHEeI+wFZ55lqXZdR/e5Lvu1bu2Ejaxg+MtWgMKZCjucOAsl6gyTPMUiF28GCRaYW5EO2EJ+RvR2ApiPgym2Mz7pgd5rAkvF7aUjusoCja7VvYduBaOGbgNKn5iz/SJGRGONbaB6MZK1AoH/losFyWq8TeyxYvbvH254Cwo200bOfQ+JuSYO3o0bh5cKj1H7j4sN1VNAN2G629D1OKZpq8Y3HJILvY80p13nggpMbApIHVyLQh2rSPR01Hg41AdIJtQj7nSGw7WYWHbdXv47evbJA8E6lAmHBtAN29xQ63rMAdrI6cNyZTznrGggAjYjCLag1WjLFe8lCjEiII5L5Q8f/feHIxogocwDxKiJrMJEUjjW3CD/Y+tSGo0nCp5CgFRCWaZ0BdV14YNqoYI/C5k8R4Wm1KeUay8wUc21eJIQnYoLn2z8nwMUE8AkifKc2pVwFoUWdyBjWlZS/uDXs+88XwR1R+FapUkUMf1ZZ2MiGgmWPJdnIEIF1ZV4dIuwEF8Wh8wnwqrwaED6vhKxn4oAwEQGfzqkBx9GJb0HbweD1LEeibxBwXE4NuBlpcec1BkSzTK2OtyeFyIn0JQA4GwhrCeievBp03K6UjQx3y8lUg04HIhvWiODmjjfAI91CBet0Fsfm1YDrAclvZNnokQ952RqrcHhbbKijpwgjG+lnAaSJVnv7fqIOUtG9lLVzmztw84HfRPdijY4j8kOf+6G2B68ftxcKm0aK9DQl5ES2BYiGooQH5GYFnDYxbQ1erwOP+XDXix9qMNUgG6P9EsqFBxcKXDBw8SFMHOwmJb0Iw1HEz+oRhS3A+1Ty31gyrb52fUFq4xtRpRXXouj0IotoyuzmVjY2EaJHFP5j8ipoOY1RhBFRPmBvCUuiw2Y/0fpG+YFtiDcqK5Ggn5ZMsdpXSKJROd4iSBJBm1XYPEbUlVkQbjhRkvBRIPgPEF6lNbcI0wy5IwNkLUcAtpjPuglPjYjyDQGs0pIp1oC4Mj9cP1JC6W0E/JeWbHGs/tmcjIASEsFzhNCzUkfKiCj3EMBcAjw0lmxxVol3Ogz2K773+D1YpUqV/w3cheZrC59q2W25WwQezjRYNfAekH3SF15vSsiJDIvteTTxXl4NOl4jggvSwwoe6S0A2skiOnS1VifcWPQZ2SsQ6NccdJnX6oQ2AYysp/nAxKPsDKH0bF4N8L2tCz49swK5G9ML/bnpzl0GRjayzwIS/+4BXtwztWBpecIRv97WSCjpAPQdgnSoazGVyNwPBOeghUfmYgF2Q+3KvHmSPDS2EgD9hQKNcwlzs5GNzIcANIKkmoPys3yuWj57bRbgOEScmIsG2AbeCVuD1/eEudBv+q/OFxVx28EoTmLnwoMv+Nwq5z+Qa8u8G5Ts15kj9UjDzUC4X92Puw2c9OqrriIkI6J8RAD9Nw2oHeIWR280hi4Goj8g4GXRZIurYY0eUd4hgmCsOcUzKlf0iMItxsMB8BQt2cJmKY7EI8qrCLB/TU8YesYjKR4TOBKfWr8/ShIXLxuQpPFq84dsfduF4vN49vgtIvxZdbFt//MJyi69ewD/91lp3HOLgLoucMGHnc9h215XigZhvDb7vSjinj1FLMLlQPZaVV3dj7sd4fY3NcINswmRZ4yXa80pt7ZkKauFtUZCEXGVKlV+MdyFZqdQPoGzG2e3kPXM9yBhyowGOE3bFZ+RYT+P64Eo33vt5oOdDLh8D+R7Q8+Od5CzTCSp0ZzlF4rSB8e/OlaSPM8AwUMi748SvkT+UKQOvoHy6ioH2jmOBuRENgFEpwK0K6a6p+N1mfHp6btRwoEImCEixVSDdg6ZCB7JkESvI9I6JDzM3ZW07QoC6bdAhfNNbSgHzTkiGxkuSA7rziqs38gsI4BjyILT87Eg+24I6VzHhbMQ8Uw3rQp6vGup0LFTr/Hhf254s9l1bNNNyoVHaTyyI06c/Ie+l/9x6fghy0cO7juuo4MUNzMtRo+EVgBZCnlpH7cMEruDAPA0WHiv1tziugFR9P84RiIcGm1uEbamGL1RYcVuGCy40M0gzIgoiwnYdY9Gu+kvEuHQQAuJhbQBjwcPn/WEbZLVhUdOHzVg86bNxTcTLtOSLa5bRXpE+attlwEwrKYnHT7jUecNFiOivEQAB/b2WIOmL10pDAtiip0mVnr3tTzeBicPDi5MwLL4A8CW6aM2QceRc5IfO1kY2yw4peFgifB1sOCRSgm6xcjovkXhW8UWbpUqVf5rOGuDO8R8TWDzrIrIRvpjHlmYWtBVvM8U9RoJAFrv8cL4zBl1jiNwO9cFYSwSXplTAyxadEQ2vhwOUNNCCK/ko+5eIezMaSFnqNCnANIPphpwHBXLidzVQNZtJHlm5GfJ7FPhiM9IX2hv9REsAcTpGzt6TfruzN0dO9aMb4EZkDyFdwhgICIe4dJBAF/CPAmp8CQQ/N7UgkJBvT+RXUxEpyBZM3LaEEcX6hJ+I/sbAJoLgNfl1IBr7pbPaJuL6LmTCH6XVwPCZgOPeMwLG3LW+rUlLSgvofxSyoUHFxs8W+fiw3XlphvwCq39RrrpyL2sYL8eJ8SaVwq1CozRGGoiohMBpQO1pg/ZL9+RxLTQUMuij8ii52LNra5GJvGwchciXOLxWCfMWur+34+HldsRYS4S/lptbhHe+DqTYeEqSYLp0SdSjvkCJWzRK4JCFsRizeLnFvUPPkR4o7JWIvQwIA0BgnEewMNFeS322izCTARpnChPZkv0iMJZNvt5PdaYmQ7JuLaeJaxwfLMJQEdSAY6MPZkShkAtaFSGSZwYSfCZ5pKpw8VZQaLX5ixbOXxzwQ6J4wRJtnSuUqXK/wY27uJtPe5U1pS/KsCnZ/4mSTBu0IZvd393zmhhF5qR418dBHbnFmssCQ5bPSvoeNiS9cyfAeEUQLjHjAYdtWk2r5DXl87yQsI3php01dH5l2R70QZ6FRDWI8HmnBp0tCDwGemjEKS/EVh35NU6oU7DvzB7LBE9RrwJCHQhIk4S6B86IZLkRO5dANoXAWfk1ABHXDgSXJweVujAlZ3rtXUll+8u+IzsbxDpYiLr8rw6xHW8IScyGpB94DdEXZ4S/nj2WJLoGQJ43HUdd8kSj7zhoEz+nH33oE3rOUuLC6TSNOOXwG7Z/+QLPhcbXM1w8SF+I3QPjg62TUouOXjITX98o01YTTF6o3IvEsy1Cnhy7Emxr8W8iRO9dbt+z6f7TxzWMbdCb2w4j/ecAaTLteSHri9UPNJwIQLeRgBxN7dTfapyDkjwAAFdG0u2Cg1gGD2sPA4IRxHQvFiyVVh5Fn01eHXpk0paiXhE4eLwaATYlxBniTxA4mHlKkS4XQKIRZOp8iqzCCOiPEsAHJQ3MdqccqzQ+fchCXogwckI1hEiTw+mGJCXQsL+3l40XDSK6twysp7lDCUtmeIxC4cQ8XtHaPtbpUqVXwxfb3gTkA23XEWCfiN7D/EJ2pIONWN+kT7LZvDiVXVSh5dTYHsTwtx8NMiOxF2wc1UQLwOEpZUs1uVEpgUIBphffRmEeZOEI13Gn8g2E1kDAVDa3Kvn5DXTBzqkcRPKRu4nAHrFbWXXl8gHETreYisHJLqOiCbltTr+3YTIevoZRJxgEV6Wd8m1YWQj8x13ZUy1Tngf8yeyZxLRvQj0p5xa5xpj4k9kDyfiYpJerhT8VjReYy3NW6YadB2b+fQMey7tbKpB1t9xR3pHHQzLhQcXG+zfsSNaKVzBlRTHbMntqNJljLByFSH8BoEuVl1u0Awn2AJBu0h/UMKIjJxEYL0IQA9qyVbXN7beGDodiBZU2vjQIwqbufApYb6beynDXRGJ8Ewi6wGtuVUYWGSvzQKcDgT5th93O2Kem1YioswhgMsQkSzL+mOs2TmvxThFOY4seBYQ79KaWhzXYLeECx8EOAMAzxC5wtqGa4gKEoy0iOa6dW+YUpAe63u0ZMpxHpkIjzzUkiweGUlkWYfEltnpwXwR5DawMNSvSpUqvxjeKmQtF6+sespf3Qaf0XYWgvQQAV6Ur9C2r1+ysvbfG3biz7qPyLonrw3hsNEuyIncLLAK95GE/6g0NimKHg9DwH3cxJmMHToHMA4t6okFnJw9M+iY5cUbLISwKR8N1pe/6AAn5yLQxwR4BgKe5da9YOR45j6QYAYR3JrXgo6/ewm/nvmSEDtMNSC8j8l6mm0K2DZ+qanWuTqFFm3reeS/xuwVGAHTUejguuuiz/v1KvT8HIC+N9Wg6/IGp+JaYO3fsbkw/Nuzh/G4rHcxR8u1qOom5cKDT/C8jbIjxH1TAIBDZRi25HXUVjwcrj/Ni9KjgHSnJvCKKGE0Kv8kgoCWdBeIGtGxu9G6DWkEfEVtanHdm14YbphckPB5Ing15iLQfOSkUQM212zmTZtXtWSKt3SE6OGGiwBwHiI9oyZbhQ5vxXXUGwngZ/JYh7tpWuz8GctaBIg8Avm7KK+lqCnhILcXtGSqYpBPPNLAqZOXAcE1IuGnHlGuJIBTJYQ+BHi31tQiFEAxRqThIWKdDOKNWlPKsTKOR0IHIRAXcTUg0QnaE3ZOD39YuJV3cPE0VqVKlf8NewHA550TVPsz14VBia8bvLT5PULU89GA6/iXkY1MExLsT0BPmVqdo0dRMUyOE1Y/2rnXz6NWTq8X6s78euZeQjivkk6CkY0M37M4KK4XSdLk/CzZ0f5ATmReAILRphrcyjRtW2Qj+0cECBDQiOIoyPGQV0JOZP6PN20kgAcqdSZkI/s2H8ZNNeBoVc8UNS28NvuuqQZd7SQYn5H5SAKS25H2/yY6hK//QmQj/REC7rLes2mfH2buLUxNl43sUgCaUiA68GutjqUPvPHDQXo8lhGKULcDHr+zsNguNnjexcUHG4D9Eo4GgFI0L3szdPkF5zc2jPYQ8rbHEi2Z4va6ED2isBBq4qYem4bMefQzXusR0t3E1QWR0IESEP/3P3JzJWXiEeVr7FxZFWoVmAWR0CkSkCEhvBNtSgkDkPRIwwkA0lJA2ihZeJgoq4Up/pz8weM2Z6W12bwFsDqWTLFwxxUjEppLSHch0L0igzA2EbMsvI3nqwTwVCyZctX+6OGGWwDxTEBo0ppS3JLrghHedzeSalhw25+ALoklW0u5ASUjHD4FCBXmVapU+cVwMFypI8DX/i50brBAixkNCq9jJfyJzL1E3Kmk1021zvGw5V+c3ZsKttB+s9XeMUbkVcH4jLYLEKQ/kYQX5mcF7CUFEXYHhehOAquXx4NHZmcGuXPaBVlv+z2gdBG62LUz/kT6bCK8gGxfIXxZtIZbwpfInIYE3DVellODW0ZAdEE2MnwYP2qzVdhzTWyo40HT//tsL9qNvgDAdaYaGF5+QICcSD8LhMd1Z9tFNtIvA+BYL1pK2qVA8RnpexDwAiLP1LwmlzY7eQOKhcgsB3Dt/nSTcuFRchvl4sPRXW47OJy7A8V/89x+K0ESh6R5C1IbArytVjDz0iPKAwgwm1za9iV4dZSAeseSra6Jq4lp9UGrILHg8sfenr7K9KVvCve39YjyMRD01JpTQ8tfdMAIK+MJ8XUg+lLqiweK0mYT4VBDAeFtCaiXJdERsSdanfe2uayc0jCovQaXE0EGEDq0ppRwjavoPTJAS6b85S8KSIRHRizJegwJH1OTLY4XikQ4dISFxMXjG4D4gdbkvj1U1MlcBwgprSnlmPrI2EJaghAg3aElW0vaGx6xlN4j3NFy3NKpUqXKDoEPg2zYx3QpPPhUDIC1phrkzogrciJzLVj2FsW7phbkTncXeG0We3a8D4jDoIAT3LQiwUT+0ALZYW7359TAheUHHJCNtklA0t8BAYFosigvxbfgq1PR43kMEC43o0Gh3k82cuMBrNcJ4CUkWFVpbTegZw6zEJZ36kXqXJ24ZSPD3d85QHSM6OdkOq3gIVAoeEe4Jd0yspG5izdYEKSzc2rAdgcXIRtZ3jKaIXlgvKg4Y3x65nJEuAMRL85FA1tGenB3ioXIPB5zXdToJuXCg4sNbhNx8eFqztINWDCzQtTK6+xK0NdaU6tr8mE5WwTwbDXZIly3Yoq+GiM3Dagd6Ob/wYmvtTWbuN3UkzzW/m4jDr1R4UKnQWtKubbmFkcOqGuH9n+xqAksGqsta/2y/OAW3HPcXj369+rFhl9BBNREmooSeqThZc6YByTvD56djr5MUCAZjaGnCWjSps2bhsx52r0jFD+lYaJk4cuE8LyokCk6x/L8jbdWvlWTKbHq2X6dGqYD4ENI9GNNjx6jZzz6ruPPoIcb7gZEnlc+uM24iE2MSkIw/ve2dr1VqlTZcfBhsOSrwRqPsj05O2gi4KE5NVi2UhfhN7K2GzMift6/59rDRKMT2Ui/CIiHIOEZrloJeyskw50GzmpxvDaV8C/M7kUWvQmIfZBA+H19j3w6ADt6ZYiwOa8GhNexTu1DLRsnZizAdXk14Cr071zbRc6LSZtqUCk/4IBPb7scUbqDAFyNt+RE9hkgazJa0uhcLCDcGGQ6Oz3WgwT0x7xa5xqBIRttNwNK14FFmqnVCU0pi6ZnSwGsP5jqkG2D7PieygdEFqO6jr66CXuBvM2FB6+Q8qoMt91dxTHdoFR4dBEvcV4Hv/G1pHsHIR5WpiHC40Tw21ize7ZIPKIsRoBTOghHneUytmCKnQFeZRojskJn4pHQYwg0teDBkWcKouCZB84ZVdPju80s7NnTI9HEWS5Op3ok9CQQTSCga0Ti0BJ6WFkICHshQC8kPFrkQcIhbUBwsUQ4OdrcwroJIUZjQ4gA3gbCD9xcTI1I6HkC6gUIGyul4i4IK4d7EF4hAJIQD442tfAMswt6o3I+EAuY6VEHwS8nZJaq+y4nsCpVquxwSqNNntvbRYjfyNxBBJdJNTApe4Z7296nZ6bw9RkIzA6p9uBvons4Xp/8RvoeAFQthGvy0aCj5quEbKTbAPDnSjfyvZ77vMeGb3v8EyQIAtHFplonDLyUjUwWAb7JqUHX0TtrGhBoIAHW7Nxr7URREcUU13Y/5U5LTaGgtMWGlrpHXfDFM1NRgmQlrw6fkfkTApxvWYXjV8eGunYUBsczEySP3QlfVqlAkvVVUUCvgUQ357Q6oSP5wIdWhWpqPf8EwqQgTI4XH/hezgWDsGOyHZQLDy42uMrZEXu6LBDk1aOt1rWKYW579/bsO2j60qVC5S2PIywk9nF/otJp24g03EqA11hAp81OtjqmHpaIhxteQcRDCKxDYkl7i8KReLjhd4h4uQc9kVlNH7g6v+kRhau/CRJKx0WbPizpWrqgRxpuA8JzAeH3okyVEnpE+S0gHAcEfcCio0UdFD2sdOYmEF2pNbe6FotFV1IukL7VkqkR5Qe2wf5vAxzLfzuyPEfEln0g/FDFG5V9kcC+QBHAJTFBQF2nmNQuRJ/Tki1O7VieZXJx59ghq1Klyg6nVHhwN/dHn5E5FQEeI8Sr8tGAa8fbn8iOIyL+3K8FkA4xVb+jJkuOZ84FCe5AgL/k1KCjjqyEbGT5wLanm+iyhG1fDtZ4AumGvCrWgMhG+h9AuKepBV0XEvxGdh4L4gmsnQA7Juaje3JgnBBZT78PEg71Qu0B6egeQq3EHotW7+cptLPP0jJTDQo3U3xG9ix+jYAKV5naENd7r7wo54dC4SNE/KRS8Fsg/uUYS6rh+/Ajrqm4r5BXTme/A8T3TDUgGhnZ4v9dL3zw971GH3uZqQZ/6QFxHOsW+ZvwL8xW51x8CO26uwmvUrJxTNmgRo80PAWAR1q1tO/sx1qzpSduy5Jp0zzrC598RwQfxJrFAk2muGLKnYPrK9/MQ08AUKOFMHl2U4qV1Y5s8T2v0pIp1w9g0asjzGYxbmMTPRyKAhK32BZXWsXlrRhC6TKJrD4W0eTYspWsbu7Cw+FQg5ezAwAWuQlOmaKvht21WbthQ8NFf/2ii9iXsVeLLfoD60k8HmvirKVip9nFJyi7dPSwOx1subxQ9PoXg/RYnJqPJVP7lx/YGpX/88V//9I3dJUqVSrD3Wj+rAUGzP/E6uHtzSueTflowFXov0d89RCP1PE2APVHxMNz0YBjh9O30JyMVuE5BHg2pwanlh9wwGdkHkGiiNVR2MdNdMrYa7NEpwHgnaYaFHop+fTMw4gwSyLYL6sFHQ9ujJxITwML7wOEvpIHDnfTPzB+PfNXQjrSIhjvlitTFInmAeFDMyr2yggkMg0W2cFvCVPtRv6NkW5DQCv3VWAvmCdO8B2U+LqPhzbnEegdU61z1VHKRiYHiD+Y0YBbeKtdqA6643XLu3vwHtHm0nZQLjy42OBvxsWH42rldsBmUKWb2y7xsPI7RJhtkXX07OaVruOA7oa5JRrrjymQ9BwiPqg1tbiKgIyI8hcCOBuQTteaWoWJhmWvDsKHtOYK3zOs3EXIZio4V0u2CPeai6uj7GD6QqWxhd4YagSi+SxmJQ9Ojgks1ovF2beswVCTKeGbuoQd0Ee0O3lJEWlaEuGGERYiFzJIgBNdwtxseBxjkTUIWXiaTAkDk4xGhe3Vh/b29B3iIuItjfm+L45dqlSp8r+l1PE41W9k/shBk6Ya5JuBkKJI9F8EONyDdEI2GnTs8BZtyz8EwM9MNeC6MejT0zcg4k1gSdPNmN/VH4jXVpHoBgvwwbxLB0U20nOAjb8Qz8pFxUZerBOxLHgPgTyEdFo+WudoyFjCl8g8bC86oOeY/CyZM72EyEYmgwBrc2pQeB8bEv+qZ7vkySNCay4a5HuPKz4jwxbjQ6nGu09+hs9RR1dCNjK8tfStqQZF2vpVVQAAFS1JREFUhz0bv5FJEdgGYW5Bp7x5OBO9tSDP/+IFkSPsdmKb2HHhwcXGJcXiwzV0rZvYb+wZocGJo/caELXAOnt2cqWrQFRvDL0PRAO1ZEouf9GBhVPq9yp4JRbfPF/Jr6JzxVP6FSJdojalhG25JdNG9d9Q2JwjgOWVvDo4oI6I7gCEW7SmlDDXxl4dxRpuQ+a1ZMp1bskFigTEimovIZwQa0oJTbRYJ4MAkppMCWOcSxiR0FsEtB9YdIBoZMPoEYUNhfZFoka1QtJvPKzoKMEBRPBjzKXwKbqynkG17fvEHvuEfVBE8HrbGB7HEEDFvfUqVar8Ispi7l77H/ntrpfG2001WHEbTjYyKwBoNFmo5WPOrqRAhP6F2S+IoJdnHdVn5tY5uhYzvgVfnYxeTzNYcJupBYVGi4ydNotoIEAy52Lx7Yt/tS9KUgsALjDV4LnlBxyQ9cwKQNgHAa92y4phOgsk6QZAuqCir4edDAsDTDXoeh/j/BsC7JFXgxUDPItmapMApJGi0VYJ2ch+DGD1MtU61+1OOZFh9+kDaBevL3+STyTotzNV+B+9xp64vq/620Frzq93cITdbsqFx90AwHbhvDa55RrNf4udNjpyj53okoOH3BJLpjgDRogeVv4GCOPX9MHBVwhWUZkHRo2q6RHc/A0grtSSLa43KdvMC/EPLGrUmlNCYQ2jRxSuEFdrFTwwFoSVkyWEZkB6QGtqde2KFJNhd/Zs2LDvTMF4gymu9/Ifd2cJpZNctSJhhdfHRnUn+E0PN/yNEA+XkMa6hdkZjSFOaQxbABfGKlisG2HlN4QwjQC++XnDhuOEY5uwcinrWYBgtlvgHlPjkTa3Fyweye2IgMIqVapUhp0oWeDP/gzsSFnqgDgiG9mnAeholHB2blZAGGkgG1m27R7vIRqd6TSecsT/cHZXqqEcAD5rqgFhVglTXHNlrcJLlezAZSPD6d6sf3DtINhCWsQoEN1rqkFXfyK/kZ5JgAkE+l3OJduFkY303xFxzHqpT+CHmbs5XhsZn5F5HokO7rGpI7Bqzp4/lR9wwBfPzEcJNADrKFMdIoyqYGQj/QaANNxUA66d4871Wus0tKRRFTZo+L5k3xN3mn7VlJ+X/Na1K7Qd8HLDG1x4cLHBe9NcfLja43aTUugcv6HZ10E4YikFmkmAE0RbESX0iMKeFj9rTSlXy9v5jQ3TvYRcld+nJlOu++B6ROF2U/9YMhUsf9GBouj1PUJ6OtbkHlBXvOkfSgjK7KaUYzoj0zk2+fRjBPITwLFuXiV6JPRnBDqbLDhIW5YSzheZeFhZgggRj4STRKm4TNF/43YiuDnWnHL1bykWclcTYF6izUerzZ/waKQLiXD9oRZKyy3Ce2dXSA8+d2xw6V/eyXBMN1M1D6tS5f8fShEZDN94hQdD2cguBLBORZBmu/lFFCPW5xLBcXktyG7EQnjbBADXVBzFLPgiAJ7aVgT60lTrXJ8rG+n3Wf9oqoG68hcd8OmZ0xHxAUJako8G2QJciC2kZWE8WY+Zap1rwrYvkV2ERNM9ROMzLvoP23+D4BICz2F5TXbNf/Eb2RsJ6EYsWOfkZg9x7coUi8MjLK93v9Vn+IRaGdt7heAWJJyZ08RFZHHD1dY5euW9mzrMz0vX6R2BvYDChQcXG+w2yTdp4UhiO8nx71n8NwfF8S+x1ZzfiDTcSIDzQEJVe6JFuGPMcIHAHQQ1mXKbR5VufK8gwJJKWzF6ROFZ3Zi2UGrXefP+3z77tjwwbVT/Hh2buehhTQMbpAnhAgGA5kge6/Do0pW8zSEkHlHeRW73FaQj1GUfCh314o0N5yLh/RbS3NlNra625Xqj8gAQnE0SnRJ7ojVZfmAb4pH6MQjSOwCU0JKtLPAUYnt1EC4AokxtT5g049FWR5Mve714zabvCOHNWLKVt2OE6BHlutuWr7r5s+/X8fuP24fC7IIqVarscFjkXxqx7FvcLNuKonX5HEScm4sGHio/sA2yno4C4gIkvCanuW/F2BssRMMqbZswsp7JEFJHPhgcDpNQmGUlGxk+ZJ7UY2O7z62D4Ju/ah/J620hon+aWh0vQQjZY8Hq3T3edj40vmlGg+zGLcTuoAD8HwGcnleDwu3KgJE52QJYRoRX5Su9TgtzUbAsg0f6ZjToGJNRQtYzcZBwZqHQMfnr2FChKWVxDXoZENxuakG2mhdRqgcAa3v/mzav5+6YcMPxv8C23OALPxcbHKW7o9LnGJ4xbbluxDd2flGaAOCZKw8eMnVw/55//HlTx903vPwFi1tLN/4t23721+46dt9mrwQj7nglXZ/bsIFXe0rP4f8v/zs2qi544ODeKwoWrLjkuY9LK0xbPpfh70l/Omm/P9dKeOr36zsmXfPipyys5Mftx7b9nx5ROJr5O7Up5RrNbDQqFxDBnwjw/FiyRWgWwxgR5VUCGE0eGB9bKo6YNxpHHkBkvUNID8cqjHeMRoW7Fxy89/+1dyfQcdQFHMd/u5ukkBbaUlFpeoiIIpcIoqByySU3akGq2FCwoqh4PFHkeYA8BOWBJx6A2JRLWgERKzdC68nhRSuCIjY0tYBS6EEPkh3fb/nPn+2+zSZNpiO+/X7eG2Yy/6UTlnT3m9k5PjD92gf6faGYfcwObavLxaVJMvBHVj+csvNexXJyd6Lk3t5Scsj75yx8Kg6+wD9DhUuP3vHhJEn6Ztyw0EdI+9RYTx7z5Xb92bKf39F7TR7bubq3fNp9PfE1wkd0N/xIBkCmfLZJeuEtfyzgS377DIvKDdk6Znb7FginS8mnezon+fXZf499eQRfzyGdWkZ3nrv1yN0O+k3vsytufOL0fX2cYGV91WPT5ZaXnHrxFzRq7AHLb/hm57qF833tnvQxfp2o/rOLY6Z9+bxCa+sWz1x3wenlZUv9kVD6epI+vjK1v3XKAa0Ttjts7YK7r1izYL4/3knH/P2my1YcdciMjypR4dnbu75f7l2Xvt9Y5fWralmbHTj9lHLfulWr7rzSB1euNxbmlfeTEa/d8/Wtk3fc97nFD81bu2Cez4qprK+ZJ8WWtlL7QSd+LFm57JFV867xe6DX+3vw5Pe0dLncuvUuk9r3OOJD5aeW3rfilku8l6n6Mb6YlyPMU9+YYz47tdSx7VHr/nb/hSvmXuSP6avH/XG8p7WjDzxxdPuRH56fJIVbl566q98bvb72shbeC+ZjYypBWtx08xXl1csdCf2+Pw1RDA/Hhi/s5Pho+Ia5gXx1Uv+G3vCI6f8j9X6o0nlSKhZak0R95SRJ67yyvmqqrGspFto8re0rr/Lj0/X15u2tpTH+89b0ltPPDOs+bkSp2L5Ja3HUmt7yirW95fQAoOrHePL/6+KottKWXl65rs8Hf1XW1cwry4WCSi3FwohyonJfufLflI7VTsPhH+pGp3IB2Di8+9x7mn1afA3/tU5fPtAE0veHipbJO/T0LlroPR39Xgl8GCqX3PDGHBv+bdrx0XBX/hD5lvO+zrs/phgffgNu9FM93DczvPis94MduNB9F+GN8cMNYGA+ENEHLfZ76ucwvPAaXyg8XzJJkq6rnVuiYqlUKBaLSV/vc0oS/4b//PoX5nG5MKK9XUm5nKxbk56Vsd54OhXaNtnUU7J65fKkrzc9KL/6camkOHLMFiqVSuXl/0mvxlr3cYVSS2txs3FbJs+tW1Netazfs3esOHLMOLW0tpWfebL6I2o/H9VTZV2xffRYJX3l8uqVK+qNx6lYai20tLYlfb296uv1L6/1Hvf8cqFQfP67r/5PqCsZsePeyeZTPnXrk2ce6ffrjcV72ef5G/QpQr64lXezfD8Ov/j4e63+rTydNnTdersAa6b+xnzmRTr5MelyOlY7T/+cdF31VPv9eF79/dZbrrduMMu16/xDmu6KS6fqddW76tJlz9Nl/yWvnnwWkuc+fqd2ni6nYeGC9g2CvEfGfwn7PQgLQK4cHq8c95mr55RGjLz2iS8d6WvrpH/n/frgye9ccRp/2SPLli/tmbzyjL398Wv12Ho6Zj02t5AkLQNdA6Ly8U5RZxSSwrRGB7JaR9eiv3qnbE/nxIbHhnXMXHyYCmWfjfHFAc9gmdl9fVLQwX1trdsvnbpVo0sA+K68TydJw6t9VkyYteisJCl+rlDU/ovfN7Hf4y+sY2b3wyqq1DNt0jZxZT86urp7E6lrSeekk+LKOiZ0dfsS7HsufvSRcTpzP/+/TPm9wO9N3gngaZMJsx9blazW7J7Oif3e6DMjMTwcGx8I8XFxHAYAIAfjZ3VfXyjLd7qteyXkahNmLrpl8QmTG4aMTfjuYx1q18cXd07s96JjKZ+ZomIya8nxjc/KsY6u7s8PFDLW0bWocuB+o3vKpMbPfHT6khO2HtSxbuNn9Ry3ZFpH/eupVBl/effRhfKY+T2dm9c9C/F/xKc73+3wcGzMCPHR70GJAAAAw+BDLnxH+Ups+Jxmx0fD84UBAACGKIaHY8OfFTk++r2+PQAAwDD4Vhu+1pZ8Xw3f7IvrKQAAgI3Fd56/0+HhA1pOCPHR8H4dAAAAQ+Qzge5weDg2fPSt42PAo28BAACGIIaHY2NaiI+G90wBAAAYov0l3e7wcGz47nuOD1+bHgAAIGu+QNltDg/HxvEhPhpeMQ4AAGCIYng4NnwLecfHlXEYAAAgOwdKutXh4djwbZEdH1fFYQAAgOwc5BuEOjwcG1NDfFwdhwEAALLje+zc7PBwbBwX4mPAG88AAAAMwdsl3eTwuEbSsZLeLWl2HAYAAMjOIZJ+7vBwbBwT4mNOHAYAAMjOoZLmOjwcG1NCfPw4DgMAAGTnMEk/c3g4Nt4V4uPaOAwAAJCdwyXd6PBwbLwzxMd1cRgAACA7R0j6qcPDsfGOEB/Xx2EAAIDsHCnpBoeHY+PoEB8/icMAAADZOcqd4fBwbPgLx8cNcRgAACA77ozrHR6ODe/+cHz8NA4DAABkx4d0XOvwcGz4gA/Hx41xGAAAIDs+ieXHDg/Hhk9xcXz8LA4DAABkx5ftmOPwcGz4oh6Oj7lxGAAAIDu+UOlsh4djw5cxdXz8PA4DAABkx7dmucbhcVO4Y5xv3nJzHAYAAMiOb0b7I4eHY+PgEB+3xGEAAIDsHCfpaoeHY+OgEB+3xmEAAIDsTJV0lcPDsXFgiI/b4jAAAEB23iPpSoeHY+OAEB+3x2EAAIDsvFfSFQ4Px8b+IT7uiMMAAADZOV7S5Q4Px8bbQnzcGYcBAACyM01Sl8PDsbFfiI9fxGEAAIDsdEqa6fBwbOwb4uOuOAwAAJCd6ZIuc3g4NvYJ8XF3HAYAAMjOiZJ+4PBwbOwd4mNeHAYAAMjO+yVd4vBwbOwV4mN+HAYAAMjODEkXOzwcG28N8fHLOAwAAJCdkyV9z+Hh2HhLiI9fxWEAAIDsfFDSdx0ejo03h/j4dRwGAADIzimSLnJ4ODb2DPHxmzgMAACQnQ9L+rbDw7GxR4iP38ZhAACA7HxE0rccHo6NN4X4+F0cBgAAyM6pkr7h8HBsvDHExz1xGAAAIDsfk/R1h4djY/cQH/fGYQAAgOx8QtKFDg/HxhtCfNwXhwEAALLzSUkXODwcG7uF+Lg/DgMAAGTnU5LOd3g4NnYN8fH7OAwAAJCd0yR91eHh2Hh9iI8/xGEAAIDsfEbSeQ4Px8YuIT7+GIcBAACyc7qkcx0ejo3Xhfj4UxwGAADIzhmSznF4ODZ2DvHx5zgMAACQnc9JOtvh4djYKcTHA3EYAAAgO1+QdJbDw7GxY4iPBXEYAAAgO2dK+qLDw7GxQ4iPhXEYAAAgO2d5r4fDw7GxfYiPv8RhAACA7Jzt4zwcHo6N1xIeAABgIzrHZ7ZUh4f3ejwYhwEAALJzrq/l4fBwbGwX4uOvcRgAACA7X5H0aYeHY+M1IT4eisMAAADZOd83inN4ODZeHeLj4TgMAACQnQskfdLh4djYNsTH3+IwAABAdr4m6eMOD8fGq0J8/D0OAwAAZOcbkk51eDg2tgnx8UgcBgAAyM63JH3E4eHYeGWIj3/EYQAAgOxcJOkUh4djY+sQH4/GYQAAgOx8R9KHHB6OjVeE+PhnHAYAAMjO9ySd7PBwbEwO8bEoDgMAAGTnYkkzCA8AAJCHSyWd5PDwXo5JYa9Hdx5bBgAATecySdMdHo6NiSE+Hmu6pwEAAOShS9I0h4djY0KIj8V5bBkAADSdyyUd7/BwbHSE+OhpuqcBAADk4SpJUx0ejo3xIT6W5LFlAADQdK6RdKzDw7GxVYiPfzXd0wAAAPIwR9IUwgMAAOThOknvcHh4L8fLw16PpXlsGQAANJ2fSDrK4eHYeFmIj8eb7mkAAAB5uFHS4Q4Px8ZLQ3w8kceWAQBA05kr6VCHh2NjyxAfTzbd0wAAAPJws6SDHR6OjZeE+Ph3HlsGAABN5zZJBzg8HBvjQnz8p+meBgAAkIc7JL3N4eHY2CLEx1N5bBkAADSduyTtQ3gAAIA8zJO0l8PDeznGhr0ey/LYMgAAaDq/kvRmh4djY0yIj6eb7mkAAAB5+K2kNzk8HBujQ3w8k8eWAQBA07lH0u6EBwAAyMP9knZ1eHgvx+Zhr8fyPLYMAACazh8k7eLwcGxsFuJjRdM9DQAAIA9/lrSTw8OxMSrEx8o8tgwAAJrOAkk7EB4AACAPD0razuHhvRwjw16PVXlsGQAANJ2HJW3r8HBstIf4eLbpngYAAJCHv0vaxuHh2Ng0xMfqPLYMAACazqOSXkF4AACAPCySNMnh4b0cm4S9Hmvy2DIAAGg6iyV1ODwcGyNCfKxtuqcBAADk4V+SXu7wcGy0hfhYl8eWAQBA03lc0ksJDwAAkId/Sxrn8PBejtaw1+O5PLYMAACazlOSxjo8HBstIT56m+5pAAAAeajclNbh4dgohfjoy2PLAACg6VTuDUd4AACAPFQuWOrw8F6OYtjrUc5jywAAoOlUzqJ1eDg2PHd8JE33NAAAgDxUjil1cKSx4QDxcu3U3/rhjKXTYB7jabCP29iT1a6rnQZ6TKPx2rHar+utG+jr2nX1lmvnw1mXzuut25C5DWedNfq60ZgN9+taA43bYB7zYuTXkXrqrR/MutqvrXZd7dc20Lp6y/XWWb3leuus0fiGrhvu3Lxcu77evN662nm9del8sOvSeb116bx2fCjLtV9XL2/o19XLg/k6r3X9bSedhjLW3/rqaTCP8TSYx1X+cY+k3cO/AAAAsLGs+i+98Gnwa6GF2AAAABBkZUJHQzdBOTk3MzlGRDQ4NjUzMuYqDWIAAAAASUVORK5CYII=	cmshogbjz0006unig73ya73rp	2026-08-08 05:40:07.168
cmsjy4ibj0009ynj3wof434a2	cmsjy4avw0007ynj3rqrlb3hx	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" version="29.3.6">\n  <diagram id="OMjeMMq5vavkE3wQKLNd" name="Page-1">\n    <mxGraphModel dx="1168" dy="1131" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==	cmrxp6xwg0000d8j5pnl9zop9	2026-08-08 05:41:30.175
cmsjy6o1f0001ot09ta73lr0h	cmsizy4z70005qj5v5c4hov9e	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="52SByAR0Fq_Ls_VO6EAn" name="Page-1">\n    <mxGraphModel dx="1257" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="132" y="154" as="geometry" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKEAAABRCAYAAAC6w8avAAAA8ElEQVR4Xu3SMRGAAAzAwNa/6HIsWMjAv4IM2Zm5gdC+E975kMbumpCWCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJfRPmJfzaA9k9PhDmS4yuAAAAEGRlQkczN0YzRUVBOEJDMDZGMzE5qw2/GwAAAABJRU5ErkJggg==	cmrxp6xwg0000d8j5pnl9zop9	2026-08-08 05:43:10.9
cmsk1mgbi000111ytemxly4pw	cmsjy4avw0007ynj3rqrlb3hx	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="OMjeMMq5vavkE3wQKLNd" name="Page-1">\n    <mxGraphModel dx="1257" dy="1468" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="149" y="-42" as="geometry" />\n        </mxCell>\n        <mxCell id="3" parent="1" style="ellipse;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="100" width="160" x="193" y="176" as="geometry" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAM0AAAE/CAYAAADlkUfPAAATzUlEQVR4Xu3dC3BU9b3A8f8+8tiQB3lsHpsEK2jlJYO0tiRSG6XTas0VCHQGgSJlzAWpjhYG5JGLKQVEHGPrgwG5F5GpUa/y0Mug946oIEm01cpgCXjL4wrJZrO7SchzQ7KPO38adsSq5QfJJrv5fmaOSfbsTM7/4Hc2e87Z/zEopQIK6F+G/v31MnpjA4EA3aB/GAwXeiEa4HIRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gFLbRBEcA9A9D//zaKxNWGwsMBEQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEAwgRDSBENIAQ0QBCRAMIEQ0gRDSAENEAQkQDCBENIEQ0gBDRAEJEE54ylbpkydJfhw4dOkJ/NRgMFp/PF60XpVRsIBCI8Xq9UT6f78JiMpm69WI2m7uNRuP5QCDQaTKZuvSilOoMBAJ1ra2tp30+n10p5VBK1fV8vbgMakQzcMUrpUb1LCMTExO/FwgERre1tWXHx8d3pKSknM/Kygrk5OSYhg0bFjVs2LAhmZmZKj09XcXGxgYXi8Vyyc966ezs/IfF4/EEv3c6ncrhcKgzZ854zp4921VTU+Oz2+2qoaEhtr293ZKYmFhrMpmONzY2/lkpdUwpdbzna9vA3Z29h2gGhjil1ESlVF58fPxkv98/pqurKzk3N7dl7NixhgkTJsSPHTs2etSoUWrkyJHKZDL121b7fD51/PhxdezYMVVdXe395JNPWo8ePaoDi4+Ojj5nNpuPNjc371dKVfUsHf22sX2EaPrHNTqSzMzMO7xe7y2NjY0jxowZ01RQUBB12223JY4bN06NGKH/0govJ0+eVEeOHFHvvfdey/vvv9999OjR5JSUlJNms7nC4XD8d09EX4TXqP4R0YTOj5RSdyYkJMzQ70Fuvvnmzp/+9KcJt9xyS0xeXl6/vnr0Ff2qVFVVpSoqKrzvvPNOy5/+9KcY/f6oo6Njp9fr3auUOhR8chghmr4zREdis9lmNzc3356RkeGbNm2asaioKCk/Pz/4pMGmsrJS7dq1q3n37t2++vp6c1JS0rt2u/0lpdRbSqn2cNgfRNP7CqOjo+/t6uqakZeX55w5c2byXXfdFRWOf271Nf3n3L59+/yvvvpqY0VFRVpcXNyujo6OF5RS+lVowCKa3jEmIyNjYUdHxz25ubmBhQsXDpk7d64lKSkp+AR8u+bmZvXiiy96tmzZ0n727FlDXFzcy/X19ZuVUkeDTxogiOYqmEym4tTU1Ae6urqGz5o163xxcXHq+PHjg+txZQ4fPqy2bt3aUF5eHhMdHX2qoaHhWZ/PtzX4hH5GNHL6zeyvLRbLUh3IsmXLMqdOnRpcid61Z88eVVZW1vCXv/zF197e/rhS6jml1PngE/oB0Vy+9KysrJVNTU3FkydPbi0pKcmYOFGfWkEofPjhh2rt2rX1+/fvT0hOTt5aV1e3XinlDMXv/iqi+efScnJyympra+fMnj3btWLFivTRo0cHVyK09EnV9evXO1966SVrdnb2H2tqahYrpdyh3Aqi+RbZ2dlrXC7Xsrlz57aUlpbqf6TgOvQvfVnPo48+6tqxY0ei1WrdWFtbuzpUW0Q0X8NisdxjsVieuOmmm6LKysrS9Rl6DEz6CoTFixc7P/30026Px7PU4/G83NdbSjSX+mFOTs5zcXFx1z755JMphYWFwRUY2Pbu3auWLFnS2NHRcbqmpubXSqmP+mqLiaaH2WxeZTAYVpeVlRkeeOCBqIuPI7w8++yz/iVLlviMRuPvOjs7f9cXW080So222Wzlw4cPt23fvt3Kmfvwp680mDdvnuvUqVN2u90+SylV3ZujGtTR2Gy25frQ5fr161uXL1+eGNwriAgbNmxoWblyZYI+VWC32zf01qAGazQxcXFx/3n99dfnb9++PY2z+JFLX11w3333NZ84caKiubm5qDdOjA7GaG6wWq37CgsL47dt25Ye3BOIaPPnz3fu3bu3zeVy/Vwp9fnVDHawRXOHxWJ5vbS0tHvZsmVDg3sBg8Ljjz9+rrS0NKqzs1N/puntKx30oIkmLS3tN62trRteeeUV49SpU83BPYBBZc+ePd6ZM2f6ExISlrvd7qeuZPCDJZqS7Ozsh/bt25fGiUroE6JTpkxprqmpKfN6vWukeyTio8nOzl5nNpsXVlVVpWRl6ZmOAKXq6upUXl5eo9fr3VxbW7tKsk8iOhqbzbbaYDA8XFlZmTxs2LDgoAHtzJkzKj8/vykQCPzebrdf9itOxEaTmZn5iN/vX1FZWZnECUt8E30iND8/v9loND7mcDj053X+qUiNZm5KSsrTFRUVSXqeMODb6HncfvzjH7c7nc5FSqkdwRXfIBKjGW80Gj8+dOiQSU+NBFwOPdXUpEmT/H6//3v6E9fBFV8j0qIxpqWl/W316tWpDz74ILNaQOSZZ55pXrNmTYPb7b5eKeUPrviKiIomNzf3zUmTJt1cXl6uJwUHxObMmeM4ePDgn8+ePXt38MGviJhoMjIyVqWkpDxUXV1tDY4OuAKjR492NTY2/qG+vn5d8MEviZRohhmNxlPV1dWmG264ITg44Ep8/vnnOhz9/uZafWQ6uKJHRESTk5PzX7/4xS8mlpWVpQVHBlyFxYsXu1577bWPampq/iX4YI9IiOYnaWlpO51OZ6LBEAnDwUAQCAT0vX5a3G73dKXUO1/eprD/v8xqtR7buHHjd+bNmxcbHBXQC7Zv3965bNmy/3O5XPrGWkHhHs19P/jBD9Z/9NFHvPlHn7j11ltbP/jgAz232r9ffCyso7Farce3bdt2A7PGoK/oWW7mz5//ucvlCl5aEs7R3GKz2fbW1tbyYTL0qezs7HN2u13P51Whfw7baHJycnYvWLBgcklJScLFwQF9Ye3ata1btmzZX1NTM03/HK7RJBsMhgan02lIS+MoM/qW2+3WR9ICgUAgVSnVFK7RLCwqKlqzc+dODgAgJGbPnu0pLy/XBwQ2h2U0WVlZb61bt+6OX/3qVyHZYcALL7ygVq1a9XZdXd2dYRlNQkKCvslPynXXXce/JkLixIkTasKECY2tra2p4RjNd1NTUz92u90cAEBIpaWltTY0NHw/HKOZf/fddz/+xhtvcAQAITVlyhT3m2+++Ug4RrN506ZNxffff78xpHsMg96WLVvUihUr/hh20aSnp7+zadOmydOn6+vogNDZuXOnWrRo0f6wiyY1NfXIrl27brz11ltDt7cApdTBgwfVjBkzPgu7aIYOHVpTWVmZPWrUJReeAn1O3yQ3Pz+/NuyisVgsrV988UW81cp5TYSWy+VS11xzTVvYRaOU/nxQILR7C+ihP+gYdtHwSoP+EravNLynQX8J2/c0Vqv1yOuvv87RM4ScPnpWVFQUfkfPOE+D/hK252n0pdmbN29esGDBgv7adxik9BUBJSUl5WF3IEAprj1D/wjna8+4yhn9IpyvcubzNAi5cP88DZ/cRMiF/Sc3lVILZ8yY8dhrr73G9E0IiV/+8pddr7766m+6u7s3heOBAI3ZaBAykTIbDfOeIWQiZd4zjRk2ERIRM8OmxlzO6GuRNpezdl9+fv7GioqK5J4xAr2qoKCgo7KycnF3d/eWi4+F64GAIO5Pg77y4osvdi5dujTi7k+jcSc09LqIvhOa1nPPzR+WlZXxGWj0iki/56bG3Z3RawbF3Z21jIyMVSkpKQ9VV1fzaoOrMnbsWJfb7f5DfX39uuCDXxL2BwK+LDc3981JkybdXF5enhl8EBCYM2eO48CBAx9/3a3QL4qoaJRSxrS0tL+tXr069cEHH0y6OEjgcjzzzDPNa9asaXS73fp2FP7giq+ItGi08Uaj8ZNDhw4Z8/LyeoYJfLuqqio1adIkv9/v/55S6nBwxdeIxGi0uVarddPBgweHjBwZvCkv8LWOHz+ubr/99s6mpqZFnZ2dLwRXfINIjUZlZmY+4vf7V1RWViaNGDEiOGDgy06ePKmnmm02Go2PORyOx4MrvkXERqPZbLbVBoPh4crKyuRhw4b1DBn4uzNnzuhgmgKBwO/tdvuay90vER2Nlp2dvc5sNi+sqqpKycrK6hk2Bru6ujqVl5fX6PV6N9fW1q6S7I+Ij0Yzm82rc3JyFr/xxhtJ48aN6xk6BqsjR46o6dOntzscjrK2trbV0v0wKKLR0tLSftPa2rrhlVdeMU6dOtXcM34MMnv27PHOnDnTn5CQsNztdj91JcMfNNH0uCM2Nvb10tLS7kceeYT5BQaZjRs3nistLY3yeDwzlFJvX+nwB1s02g1Wq3VfYWFh/LZt29J79gMi3Pz585179+5tc7lcP9eXl13NcAdjNFpMcnLynuuuu+6W559/PmH8+PE9uwOR5vDhw+r+++/3nD59urK+vv4updT5qx3jYI3mApvNtryurm79+vXrW5cvX57490cRKTZs2NCycuXKhKysrJV2u31Db41rUEfTY7TNZisfPny4bfv27VZOhIY/fcJy3rx5rlOnTtntdvsspVR1b46KaHrEx8c/2tXVVfLUU0+ZFy1adPFhhJlNmzbpD5D5EhMTH3O5XP/WF5tPNJf6YU5OznNxcXHXPvnkkymFhYXBFRjY9KwxS5Ysaezo6DhdU1Pza6XUR321xUTzNSwWyz0Wi+WJm266KaqsrCydE6IDlz5RuXjxYuenn37a7fF4lno8npf7emuJ5ltkZ2evcblcy+bOndvy29/+1mqz2YLr0L9qa2tVaWmpa8eOHYlWq3VjbW2t+Mz+lSKafy4tPj5+bXt7+78WFxd3PfzwwzGjRo0KrkRoVVdXq6efftr3/PPPG5OSkv7j3LlzK5RS7lBuBdFcvnR96LKpqal48uTJrSUlJRkTJ04MrkTf+vDDD/WcyvX79+9PSE5O3qpPFSilnMEnhBDRyMWkpqYu7erqeujGG2/0LV26NGPq1KnBlehde/bsUU888UT9Z599ZoqOjv5DQ0PDE71xgvJqEM1VMJlMxampqQ90dXUNnzVr1vni4uJUri64evos/tatWxvKy8tjoqOjTzU0NDzr8/m2Bp/Qz4imd4zJyMhY2NHRcU9ubm5gwYIFQ+69915LUhJze1yu5uZmtWPHDs/mzZvbz549a4iLi3u5vr5+s1LqaPBJAwTR9L7C5OTkBU1NTYUFBQWt06dPT7jzzjsVVxr8I33m/q233lK7d+/uePfdd+MyMzPfdjgcz+nJ+oNPGoCIpu8MUUrdabPZZjc3N9+ekZHhnTZtmqmoqCgpPz8/+KTBprKyUkfSvGvXLl99fb05KSnpXbvd/pJS6i2lVHs47A+iCZ0fDRkyZEpMTMyMQCCQnpeXFygoKIjT00zpxWQyhW5LQsTn812YGkkf+Tpw4EBnRUVFwGQyub1e765z587tVEp9EKJN6VVE0z+uUUrlZWZm/szr9U5qbGwcPmbMmKaCgoKo2267LVFfgRCOf87pP7f0Gfr33nuv5f333+8+evRockpKyimz2VzhcDj0h76qlFJf9M8u7z1EMzDE6YhiY2N/NHTo0J91dHR8t7OzM/Haa6/1jBs3LnrcuHExev42fVJVf+3PVyX96qHnCTt27NiFr3/961+7jhw50n3y5MkYi8XSOmTIkP9taWn5n7a2tgM9kXQMjF3ce4hm4IpXSulLD0ampKRMiI2N/f758+evb2xsTE9MTDyfnp7utdlsxtzc3OicnBxzZmamnutNpaenq9jY2AuLxWIJfv/lpbOz85LF4/Fc8rPT6VQOh+PCYrfbfWfOnOmqra31OZ1Oc0tLiz5P5YqLizvR3t7+cUNDwydKqWM9S9vA3Z29h2jCk57g/eKSFRsbm5OYmDg8JibmO16v1xoIBGK9Xm+Uz+eL8vv9MX6/P7q7u9vs9XovLGazWf/HGxUV5TWZTF0Gg+G8yWTqNpvN3UajUX/v9Pl8X7S0tJxua2vTf045vrIMav8PMB7jy8tR77QAAAAQZGVCRzhCODBFRjY0REQwOThGRjkLTEODAAAAAElFTkSuQmCC	cmshogbjz0006unig73ya73rp	2026-08-08 07:19:26.238
cmsk1y49b000711ytrxt87j67	cmsjy4avw0007ynj3rqrlb3hx	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="OMjeMMq5vavkE3wQKLNd" name="Page-1">\n    <mxGraphModel dx="1257" dy="668" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="219" y="402" as="geometry" />\n        </mxCell>\n        <mxCell id="3" parent="1" style="ellipse;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="100" width="160" x="554" y="487" as="geometry" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,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	cmshogbjz0006unig73ya73rp	2026-08-08 07:28:30.48
cmsk1ybjl000b11ytadet5zs1	cmsjy4avw0007ynj3rqrlb3hx	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="OMjeMMq5vavkE3wQKLNd" name="Page-1">\n    <mxGraphModel dx="1257" dy="1068" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="219" y="402" as="geometry" />\n        </mxCell>\n        <mxCell id="3" parent="1" style="ellipse;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="100" width="160" x="554" y="487" as="geometry" />\n        </mxCell>\n        <mxCell id="4" edge="1" parent="1" style="edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;shape=flexArrow;rounded=1;startSize=8;endSize=8;" value="">\n          <mxGeometry relative="1" width="140" as="geometry">\n            <Array as="points" />\n            <mxPoint x="332" y="334" as="sourcePoint" />\n            <mxPoint x="472" y="334" as="targetPoint" />\n          </mxGeometry>\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	data:image/png;base64,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	cmshogbjz0006unig73ya73rp	2026-08-08 07:28:39.921
\.


--
-- Data for Name: flows; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.flows (id, legacy_id, legacy_source, name, description, thumbnail, diagram_data, is_public, is_favorite, workspace_id, project_id, app_type, app_context, marked_for_downgrade, version, created_at, updated_at, deleted_at, creator_id, last_modified_by_id) FROM stdin;
cmsizxcgx0001qj5v7fuxd3jb	\N	\N	Pro test1	\N	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWJiYGBgAAAAAP//XRcpzQAAAAZJREFUAwAADwADJDd96QAAAABJRU5ErkJggg==	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" version="29.3.6">\n  <diagram id="ByqskqYlwgqtICKhAMtS" name="Page-1">\n    <mxGraphModel dx="1234" dy="1131" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	pro	f	1	2026-08-07 13:44:09.058	2026-08-07 13:44:27.528	\N	cmrxp6xwg0000d8j5pnl9zop9	cmrxp6xwg0000d8j5pnl9zop9
cmsj7sn21000711rwntnpepuj	\N	\N	Spiderman	\N	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NgYGBgAAAABQABOz4IWwAAABBkZUJHOUVGRjlFMTQwMUY0QjFCRh319JYAAAAASUVORK5CYII=	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="xr_ukPTucd2vB0oZU4N_" name="Page-1">\n    <mxGraphModel dx="1266" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	team	f	1	2026-08-07 17:24:26.425	2026-08-08 07:05:52.883	\N	cmshogbjz0006unig73ya73rp	cmrxp6xwg0000d8j5pnl9zop9
cmsjy2f1r0001ynj37yz2rwjs	\N	\N	spidey flow	\N	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAh4AAAG6CAYAAABHpk8vAAAgAElEQVR4XuydCXwTZf7/P88kLYfghQc0bQqIJ01RQfFC8V5dD5qCN02KtvXe1V3vVdH1Wl1Xd3WVtkCTgseKTfFY11vX9b5pirdC06YorngAcrSZ5//6PMmENJ2ZFK0/cf/z5jXMzPNMpjmeeZ7v870eAeABANMA6ACkxfZT1BlbX64xto25tr83kl2WveW6xq7erC67LNe5WZnVubH/MWXGvq9lfdmT7DK7OmJWRuzO7erIjz3PJlc96cs1myrC4o1ll2efk+yy7HPSl7Lsc5JZZnZsVkZyHf9UZT90TzLLsuvN9mZl2XuzMmNvVmbszcqMfa4ys/ONPc4+zzz+Kc7/r8qs/o5duV2dVXnm1pdruPX1unVCCLFeSpmXepGDg4ODg4ODw08GpQ85aNAgrFq1ClJK003X9V5lueqsyu22H/Ka/tjM/u769ev/m0gk9Mwyknlt6lzour5+7dq13/CYZazjdfx+M46N8vQ1qU2sXbt2VVdX11qjjmRel33O15iVE77nVatWfWf8faMu8zU8ziw3jlPw86SP+V/2vVL7HvdIJBLdq1atWm3UZV+XOuYu8zx9XWY5yfwuMusy30sG6jzjfZPsawwyP18mva43Plu6oDeqLuMzWGF3jz6T9X0p8vPz8wcMGJCfLvg/RAih3kx+fv5At9vtNvvTmqaljzNINgRh/7UY9cbfycTstfwu3G73gKw607+V+b4y6kyvNc4HDx68eWadyXGP12fWW/y9zGu1gQMHDs1+bV/3mcfcZ9eb7c3KsvdmZT9FXfZx9vnGHmef29X1x/n/VZnV37Ert6uzKs/c+usabltuuWXiu+++c/EVcsyYMfj444/Vix0cHBwcHBwc+pv8/Hy9q6tLU4LHQQcdhOeffz5d6eDg4ODg4ODQXyQSCaQUo0qdLU899VTMnz/fqHdwcHBwcHBw6DdWrlyJzTffnIerlOBx4YUX4tZbbzXqHRwcHBwcHBz6jS+++ALDhw/n4XIlePzhD3/AH//4R6PewcHBwcHBwaHfWLp0KUaNGsXDNiV43HDDDbjsssuMegcHBwcHBweHfoMBLDvttJM6VILHbbfdht/+9rdGvYODg4ODg4NDv/Hee+9h7Nix6lAJHrW1taiurjbqHRwcHBwcHBz6jUWLFmH33XdXh0rwuPPOO3HOOecY9Q4/kO+//x6dnZ3wer2MV06X/xh+ins6OOSCico6OjowYMAAbLfdduny/oD3ZpvmffPy8pS3+9ChQ9P1Dg4/JT9l23aw5s0338Ree+2lDpXgwYgWRrY49KasrAxtbW04/vjjMXPmTGy11VY499xzcc8998Dv9+OWW25RkhzLJk+ejP322w/33nsvuru78Ze//AUjRoxI34vcd999CAaDzIyqzFts+C+88AIqKipw0kknqexuZGPu6eCQC7a3yy+/XEWvDR48WLXlr7/+Gq2trbjiiiswceJEdV1XV5dq008++STOOussJfj+7W9/w0UXXYRTTjlFtUHW817kyiuvVG2UdfRazzTbckJz3XXXobGxEUcccQS+++475Uv2+eefgyH83377LZ555hklhDz77LPqNQ4OG0t/tW1mND799NMRCoWwww474NVXX8U222yDDz74AGeeeSY8Ho/an3feeap/PvjggzFlyhQsW7ZMvebPf/6zatcO5rzyyitqLOOh41yaA5qgGPGz5ZZbYuDAgSgqKkIsFkNLSwsWLFiA6dOnY/z48UpAYQdLKFHTiYbJUl5//fVesznauWjvisfjKCgowMMPP6wEGyOs+aOPPtroezo45OLLL79Ugu6OO+6o2hhhm6Ow8NBDD+G4445DTU0N6urq8Mknn6jOl8ybN08JxiyvqqpSZezg16xZowQRl8ulOnuabJcvX45IJKLaM7n44otx8803q+uYqJB/l+3e0N7xev5ddvIODj+U/mzbnNhROOYgScGY/X5zc7Mq32effdR4cNVVV6lJ4AUXXIAlS5aoySkFkJNPPlndw6E3//73v9UkhYdK8OCs5dprrzXqHUxYt25dD8HDgNqLcDiMO+64Q2koDM4++2zcfffdvcpJtuDBe2+22WZK4v7vf/+rHpiNvaeDQy7MOuenn34ahx9+OEpLS1UHzXC3YcOGqXZoQOFg++2371HO9soZY6bgwfsceuih6pydzIQJE9RMlFFzTU1NmDp1qtoosGfCDtvR4jn8GPqzbVMrxwgMttkTTzxRaakfeeQRdf9swYOaE/bLc+fOTd3RwQpq9jn5cLvdLynBg+ojDmgO1lgJHtRMvP3220oiptrN4Oqrr1bCHDUmnAlmki14EGoz2Nhfeuklpcrb2Hs6OOTCrHOm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	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="IU1GDoConKKwoJuG3kVR" name="Page-1">\n    <mxGraphModel dx="1257" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="swimlane;fontStyle=2;childLayout=stackLayout;horizontal=1;startSize=28;horizontalStack=1;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;swimlaneFillColor=none;fontFamily=Permanent Marker;fontSize=16;points=[];verticalAlign=top;stackBorder=0;resizable=1;strokeWidth=2;sketch=1;disableMultiStroke=1;" value="" vertex="1">\n          <mxGeometry height="440" width="540" x="20" y="20" as="geometry" />\n        </mxCell>\n        <object label="TO DO" status="New" id="3">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#A0522D;" vertex="1">\n            <mxGeometry height="412" width="180" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 1&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="4">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 2&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="5">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 3&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="6">\n          <mxCell parent="3" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="221" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="DOING" status="In progress" id="7">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#006600;" vertex="1">\n            <mxGeometry height="412" width="180" x="180" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 4&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="8">\n          <mxCell parent="7" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 5&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="9">\n          <mxCell parent="7" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="DONE" status="Completed" id="10">\n          <mxCell parent="2" style="swimlane;strokeWidth=2;fontFamily=Permanent Marker;html=0;startSize=1;verticalAlign=bottom;spacingBottom=5;points=[];childLayout=stackLayout;stackBorder=20;stackSpacing=20;resizeLast=0;resizeParent=1;horizontalStack=0;collapsible=0;sketch=1;strokeColor=none;fillStyle=solid;fillColor=#1BA1E2;" vertex="1">\n            <mxGeometry height="412" width="180" x="360" y="28" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 6&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="11">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="21" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 7&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="12">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="121" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="Task 8&lt;br&gt;&lt;span style=&quot;font-weight: normal&quot;&gt;&lt;i&gt;&lt;font style=&quot;font-size: 10px&quot;&gt;%status%&lt;/font&gt;&lt;/i&gt;&lt;/span&gt;" placeholders="1" id="13">\n          <mxCell parent="10" style="whiteSpace=wrap;html=1;strokeWidth=2;fillColor=swimlane;fontStyle=1;spacingTop=0;rounded=1;arcSize=9;points=[];sketch=1;fontFamily=Permanent Marker;hachureGap=8;fillWeight=1;" vertex="1">\n            <mxGeometry height="80" width="140" x="20" y="221" as="geometry" />\n          </mxCell>\n        </object>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmshogbjz0006unig73ya73rp	\N	\N	team	f	1	2026-08-08 05:39:52.623	2026-08-08 05:40:11.681	\N	cmshogbjz0006unig73ya73rp	cmshogbjz0006unig73ya73rp
cmsizy4z70005qj5v5c4hov9e	\N	\N	Team Flow 111	\N	data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKEAAABRCAYAAAC6w8avAAAA8ElEQVR4Xu3SMRGAAAzAwNa/6HIsWMjAv4IM2Zm5gdC+E975kMbumpCWCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJmZCcCcmZkJwJyZmQnAnJfRPmJfzaA9k9PhDmS4yuAAAAEGRlQkczN0YzRUVBOEJDMDZGMzE5qw2/GwAAAABJRU5ErkJggg==	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="52SByAR0Fq_Ls_VO6EAn" name="Page-1">\n    <mxGraphModel dx="1257" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="132" y="154" as="geometry" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	team	f	1	2026-08-07 13:44:46.003	2026-08-08 07:07:16.989	\N	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp
cmsjy4avw0007ynj3rqrlb3hx	\N	\N	new teststs	\N	data:image/png;base64,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	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" version="29.3.6">\n  <diagram id="OMjeMMq5vavkE3wQKLNd" name="Page-1">\n    <mxGraphModel dx="1252" dy="1131" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <mxCell id="2" parent="1" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="80" width="160" x="219" y="402" as="geometry" />\n        </mxCell>\n        <mxCell id="3" parent="1" style="ellipse;whiteSpace=wrap;html=1;" value="" vertex="1">\n          <mxGeometry height="100" width="160" x="277" y="631" as="geometry" />\n        </mxCell>\n        <mxCell id="4" edge="1" parent="1" style="edgeStyle=none;orthogonalLoop=1;jettySize=auto;html=1;shape=flexArrow;rounded=1;startSize=8;endSize=8;" value="">\n          <mxGeometry relative="1" width="140" as="geometry">\n            <Array as="points" />\n            <mxPoint x="332" y="334" as="sourcePoint" />\n            <mxPoint x="472" y="334" as="targetPoint" />\n          </mxGeometry>\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	team	f	1	2026-08-08 05:41:20.541	2026-08-08 07:41:35.274	\N	cmrxp6xwg0000d8j5pnl9zop9	cmshogbjz0006unig73ya73rp
cmsk6ol0r0001n0ljnsfxek10	\N	\N	Untitled Flow	\N	data:image/png;base64,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	<mxfile host="192.168.0.106" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0" version="29.3.6">\n  <diagram id="2kY0ztmmeqT8JSZvsle-" name="Page-1">\n    <mxGraphModel dx="1257" dy="1105" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">\n      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n        <object label="Subnet&lt;br&gt;%subnet%.x" placeholders="1" subnet="192.168.0" id="2">\n          <mxCell parent="1" style="ellipse;whiteSpace=wrap;html=1;strokeWidth=2;fillColor=#EDF5FF;fontSize=15;strokeColor=none;container=1;verticalAlign=top;spacingBottom=0;spacingTop=4;fontStyle=1;fontColor=#7EA6E0;metaEdit=1;" vertex="1">\n            <mxGeometry height="311" width="409" x="20" y="20" as="geometry">\n              <mxRectangle height="60" width="250" x="-576" y="218" as="alternateBounds" />\n            </mxGeometry>\n          </mxCell>\n        </object>\n        <mxCell id="3" edge="1" parent="2" source="9" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;endFill=0;strokeColor=#0A3DA3;strokeWidth=2;fontSize=12;fontColor=#0A3DA3;startSize=8;endSize=8;curved=1;" target="6" value="">\n          <mxGeometry relative="1" as="geometry" />\n        </mxCell>\n        <mxCell id="4" edge="1" parent="2" source="7" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=none;endFill=0;strokeWidth=2;fontSize=12;fontColor=#0A3DA3;strokeColor=#0A3DA3;rounded=0;startSize=8;endSize=8;curved=0;" target="9">\n          <mxGeometry relative="1" as="geometry">\n            <Array as="points">\n              <mxPoint x="85" y="182" />\n              <mxPoint x="205" y="182" />\n            </Array>\n            <mxPoint x="-6" y="239" as="targetPoint" />\n          </mxGeometry>\n        </mxCell>\n        <mxCell id="5" edge="1" parent="2" source="8" style="edgeStyle=orthogonalEdgeStyle;html=1;endArrow=none;endFill=0;strokeWidth=2;fontSize=12;fontColor=#0A3DA3;strokeColor=#0A3DA3;rounded=0;startSize=8;endSize=8;curved=0;" target="9">\n          <mxGeometry relative="1" as="geometry">\n            <Array as="points">\n              <mxPoint x="321" y="182" />\n              <mxPoint x="205" y="182" />\n            </Array>\n            <mxPoint x="205" y="211" as="targetPoint" />\n          </mxGeometry>\n        </mxCell>\n        <object label="%subnet%.2" placeholders="1" id="6">\n          <mxCell parent="2" style="image;html=1;image=img/lib/clip_art/computers/Monitor_Tower_128x128.png;fontFamily=Helvetica;fontSize=12;fontColor=#0A3DA3;align=center;strokeWidth=2;fillColor=#EDF5FF;fontStyle=1;verticalAlign=bottom;strokeColor=none;labelBackgroundColor=#EDF5FF;labelBorderColor=none;labelPosition=center;verticalLabelPosition=top;" vertex="1">\n            <mxGeometry height="79" width="115" x="147" y="80" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="%subnet%.3" placeholders="1" id="7">\n          <mxCell parent="2" style="image;html=1;image=img/lib/clip_art/computers/Laptop_128x128.png;fontFamily=Helvetica;fontSize=12;fontColor=#0A3DA3;align=center;strokeWidth=2;fillColor=#EDF5FF;fontStyle=1;verticalAlign=bottom;strokeColor=none;labelBackgroundColor=#EDF5FF;labelBorderColor=none;labelPosition=center;verticalLabelPosition=top;" vertex="1">\n            <mxGeometry height="80" width="80" x="45" y="80" as="geometry" />\n          </mxCell>\n        </object>\n        <object label="%subnet%.1" placeholders="1" id="8">\n          <mxCell parent="2" style="image;html=1;image=img/lib/clip_art/computers/Mainframe_128x128.png;strokeColor=none;strokeWidth=2;fillColor=#EDF5FF;fontSize=12;fontColor=#0A3DA3;labelBackgroundColor=#EDF5FF;fontStyle=1;labelBorderColor=none;labelPosition=center;verticalLabelPosition=top;align=center;verticalAlign=bottom;" vertex="1">\n            <mxGeometry height="80" width="80" x="281" y="79" as="geometry" />\n          </mxCell>\n        </object>\n        <mxCell id="9" parent="2" style="image;html=1;image=img/lib/clip_art/networking/Switch_128x128.png;strokeColor=none;strokeWidth=2;fillColor=#EDF5FF;fontSize=12;labelBackgroundColor=#EDF5FF;fontStyle=1;fontColor=#0A3DA3;" value="Ethernet Switch" vertex="1">\n          <mxGeometry height="42" width="80" x="165" y="218" as="geometry" />\n        </mxCell>\n        <mxCell id="10" edge="1" parent="1" source="11" style="edgeStyle=none;curved=1;html=1;strokeWidth=2;fontSize=12;endArrow=none;endFill=0;rounded=0;fontColor=#0A3DA3;strokeColor=#0A3DA3;startSize=8;endSize=8;" target="9">\n          <mxGeometry relative="1" as="geometry">\n            <mxPoint x="248" y="270" as="targetPoint" />\n          </mxGeometry>\n        </mxCell>\n        <mxCell id="11" parent="1" style="image;html=1;image=img/lib/clip_art/networking/Switch_128x128.png;strokeColor=none;strokeWidth=2;fillColor=#EDF5FF;fontSize=12;fontColor=#0A3DA3;fontStyle=1;labelBackgroundColor=none;" value="Concentrator&lt;br&gt;" vertex="1">\n          <mxGeometry height="53" width="80" x="389" y="326" as="geometry" />\n        </mxCell>\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n	f	f	cmrxp6xwg0000d8j5pnl9zop9	\N	\N	pro	f	1	2026-08-08 09:41:03.724	2026-08-08 09:41:17.903	\N	cmshogbjz0006unig73ya73rp	cmrxp6xwg0000d8j5pnl9zop9
\.


--
-- Data for Name: iap_transactions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.iap_transactions (id, user_id, provider, store, event_id, event_type, product_id, transaction_id, price_cents, currency, created_at) FROM stdin;
cms9asm5m001w127tnl9prrlz	cmrxp6xwg0000d8j5pnl9zop9	google	PLAY_STORE	gp:GPA.3306-1147-5266-25620	INITIAL_PURCHASE	com.valuecharts.app.mth_5	GPA.3306-1147-5266-25620	\N	usd	2026-07-31 18:50:42.347
\.


--
-- Data for Name: issue_list; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.issue_list (id, legacy_id, legacy_source, title, flow_id, flow_item_id, company_id, is_checked, created_by, app_type, created_at, workspace_id, app_context) FROM stdin;
\.


--
-- Data for Name: message_notifications; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.message_notifications (id, message_id, conversation_id, user_id, is_seen, is_sender, flagged, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: message_reactions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.message_reactions (id, message_id, user_id, emoji, created_at) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.messages (id, body, conversation_id, user_id, type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.notification_preferences (id, user_id, category, app_context, in_app, push, email, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_quiet_hours; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.notification_quiet_hours (id, user_id, enabled, start_hour, end_hour, timezone, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.notifications (id, user_id, type, title, message, is_read, action_url, metadata, created_at, expires_at, app_context, workspace_id) FROM stdin;
cmsj64n7c0007vqoc9qn3dxyu	cmshogbjz0006unig73ya73rp	team_member_removed	Removed from team	You have been removed from "Infinity".	f	/dashboard/teams	{"teamId": "cmsj0p8dk00021xyk2udsbks8", "teamName": "Infinity", "removedBy": "cmrxp6xwg0000d8j5pnl9zop9"}	2026-08-07 16:37:47.257	\N	team	\N
cmsk1mgbt000311yt4sgkn1jq	cmrxp6xwg0000d8j5pnl9zop9	flow_updated	Flow updated	spiderman123 edited "new teststs".	f	/dashboard/flows/cmsjy4avw0007ynj3rqrlb3hx	{"flowId": "cmsjy4avw0007ynj3rqrlb3hx", "editedBy": "cmshogbjz0006unig73ya73rp", "flowName": "new teststs"}	2026-08-08 07:19:26.249	\N	team	cmrxp6xwg0000d8j5pnl9zop9
cmr0qwfvr0003o04sslwjxead	cmpqkkbd5000121k228ai47n6	SECURITY_ALERT	New sign-in to your account	We detected a sign-in from a new device or location (172.18.0.4). If this was you, no action is needed.	f	/dashboard/settings/security	{"ip": "172.18.0.4", "kind": "new_device_login", "userAgent": "axios/1.13.5"}	2026-06-30 14:31:56.775	\N	pro	cmpqkkbd5000121k228ai47n6
cmsj6cien00036kuhn7bj5lxj	cmshogbjz0006unig73ya73rp	team_member_removed	Removed from team	You have been removed from "Infinity".	f	/dashboard/teams	{"teamId": "cmsj0p8dk00021xyk2udsbks8", "teamName": "Infinity", "removedBy": "cmrxp6xwg0000d8j5pnl9zop9"}	2026-08-07 16:43:54.288	\N	team	cmshogbjz0006unig73ya73rp
cmsj7jy5c000411rwbsffw49y	cmshogbjz0006unig73ya73rp	team_member_removed	Removed from team	You have been removed from "Infinity".	f	/dashboard/teams	{"teamId": "cmsj0p8dk00021xyk2udsbks8", "teamName": "Infinity", "removedBy": "cmrxp6xwg0000d8j5pnl9zop9"}	2026-08-07 17:17:40.896	\N	team	cmshogbjz0006unig73ya73rp
cmsj8w6290003tzwgis4b0dou	cmshogbjz0006unig73ya73rp	team_member_removed	Removed from team	You have been removed from "Infinity".	f	/dashboard/teams	{"teamId": "cmsj0p8dk00021xyk2udsbks8", "teamName": "Infinity", "removedBy": "cmrxp6xwg0000d8j5pnl9zop9"}	2026-08-07 17:55:10.642	\N	team	cmshogbjz0006unig73ya73rp
cms2uru4g0006cb5ct4aqnv9l	cms2uqs670000cb5ckamr8k1i	SECURITY_ALERT	New sign-in to your account	We detected a sign-in from a new device or location (172.18.0.2). If this was you, no action is needed.	f	/dashboard/settings/security	{"ip": "172.18.0.2", "kind": "new_device_login", "userAgent": "axios/1.13.5"}	2026-07-27 06:35:35.104	\N	pro	cms2uqs670000cb5ckamr8k1i
cms4v7wgv000g5ensr8r68f9d	cms2uqs670000cb5ckamr8k1i	SECURITY_ALERT	New sign-in to your account	We detected a sign-in from a new device or location (172.18.0.3). If this was you, no action is needed.	f	/dashboard/settings/security	{"ip": "172.18.0.3", "kind": "new_device_login", "userAgent": "axios/1.13.5"}	2026-07-28 16:23:36.991	\N	pro	cms2uqs670000cb5ckamr8k1i
cmsjcbvqv0003h0xdc5xtftd5	cmshogbjz0006unig73ya73rp	SECURITY_ALERT	New sign-in to your account	We detected a sign-in from a new device or location (142.251.43.202). If this was you, no action is needed.	f	/dashboard/settings/security	{"ip": "142.251.43.202", "kind": "new_device_login", "userAgent": "curl/8.7.1"}	2026-08-07 19:31:22.615	\N	pro	cmshogbjz0006unig73ya73rp
\.


--
-- Data for Name: offers; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.offers (id, off_name, type, plan_offer, user_offer, start_date, expired_date, status, after_offer_id, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: password_resets; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.password_resets (id, email, token, created_at) FROM stdin;
cmq50codr000y5qtps40g2dhx	babu.webronic@gmail.com	bc756b2396cd10e6f77b07cf4bcec6534627ff43aee5333880dab3b209a08afa	2026-06-08 09:27:53.2
cms8m2tqw000s127t3uyz4psh	test123@gmail.com	11d7c2306294df02bdb74c314bc5970ba522dd1eece5b03baad3c24f58db7212	2026-07-31 07:18:48.344
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.permissions (id, name, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: plans; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.plans (id, legacy_id, legacy_source, name, duration, no_duration, price, free_trial, grace_period, user_access, user_count, user_cost, status, permission_access, features, tier, color_pick, fontname, sub_plan_id, sub_top_id, app_type, created_at, updated_at, deleted_at) FROM stdin;
cmpqgy2dj0007ch6ovx0ecur7	\N	\N	Free	monthly	\N	0	0	0	f	\N	\N	active	\N	"[\\"1 Flow\\",\\"Basic shapes\\",\\"Export PDF\\"]"	0	\N	\N	\N	\N	\N	2026-05-29 05:15:52.327	\N	\N
cmpqgy2dp0008ch6o5pmc6ytg	\N	\N	Pro Monthly	monthly	\N	5	0	0	f	\N	\N	active	\N	"[\\"10 Flows\\",\\"All shapes\\",\\"Export all formats\\",\\"Priority support\\"]"	1	\N	\N	\N	\N	\N	2026-05-29 05:15:52.334	\N	\N
cmpqgy2ds0009ch6oce38pkc2	\N	\N	Pro Yearly	yearly	\N	36	0	0	f	\N	\N	active	\N	"[\\"10 Flows\\",\\"All shapes\\",\\"Export all formats\\",\\"Priority support\\"]"	1	\N	\N	\N	\N	\N	2026-05-29 05:15:52.336	\N	\N
cmpqgy2du000ach6ohbfeveek	\N	\N	Team Monthly	monthly	\N	5	0	0	t	5	2.5	active	\N	"[\\"Unlimited flows\\",\\"Team collaboration\\",\\"All shapes\\",\\"Admin dashboard\\",\\"Team management\\"]"	2	\N	\N	\N	\N	enterprise	2026-05-29 05:15:52.338	\N	\N
cmpqgy2dw000bch6omdgay2xw	\N	\N	Team Yearly	yearly	\N	36	0	0	t	5	25	active	\N	"[\\"Unlimited flows\\",\\"Team collaboration\\",\\"All shapes\\",\\"Admin dashboard\\",\\"Team management\\"]"	2	\N	\N	\N	\N	enterprise	2026-05-29 05:15:52.341	\N	\N
\.


--
-- Data for Name: pro_flow_purchases; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.pro_flow_purchases (id, user_id, flow_count, amount_cents, stripe_payment_intent_id, pack_type, is_unlimited, expires_at, grace_period_ends_at, status, notified_7_days, notified_3_days, notified_1_day, renewed_from_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.projects (id, name, description, cover_image, created_by, workspace_id, app_context, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: promocodes; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.promocodes (id, promo_code, valid_upto, discount_percentage, legacy_source, created_at, updated_at, deleted_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.roles (id, legacy_id, title, created_at, updated_at) FROM stdin;
cmpqgy2d30000ch6oif585n3b	1	Super Admin	2026-05-29 05:15:52.311	2026-05-29 05:15:52.311
cmpqgy2d80001ch6o8nk19yet	2	Company Admin	2026-05-29 05:15:52.317	2026-05-29 05:15:52.317
cmpqgy2da0002ch6ouzs8grf5	3	Process Manager	2026-05-29 05:15:52.319	2026-05-29 05:15:52.319
cmpqgy2dc0003ch6ozrkohjew	4	User	2026-05-29 05:15:52.32	2026-05-29 05:15:52.32
cmpqgy2dd0004ch6o8wh6zytd	5	Free user	2026-05-29 05:15:52.322	2026-05-29 05:15:52.322
\.


--
-- Data for Name: shape_groups; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.shape_groups (id, legacy_id, legacy_source, name, user_id, is_predefined, team_id, app_type, app_context, created_at, updated_at, deleted_at, workspace_id) FROM stdin;
cmsk094wx0001mn9ouk95o2dt	\N	\N	rrr	cmrxp6xwg0000d8j5pnl9zop9	f	0	\N	pro	2026-08-08 06:41:05.313	\N	\N	\N
\.


--
-- Data for Name: shapes; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.shapes (id, legacy_id, legacy_source, name, type, content, text_alignment, ratio_lock, shape_type, group_id, owner_id, app_type, app_context, category, xml_content, thumbnail, is_public, created_at, updated_at, deleted_at, workspace_id, associated_team_id, associated_chat_group_id, association_type) FROM stdin;
\.


--
-- Data for Name: subscription_history; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.subscription_history (id, user_id, plan_name, product_type, status, price, currency, is_recurring, source, started_at, expires_at, archived_at, archived_reason, archived_by, stripe_payment_id, app_context, snapshot) FROM stdin;
cms9asm7g0028127tforaqhnn	cmrxp6xwg0000d8j5pnl9zop9	Team Monthly	team_monthly	active	0	usd	t	stripe	2026-07-31 18:50:42.4	2026-08-31 18:50:42.371	2026-07-31 18:50:42.406	purchase	\N	GPA.3306-1147-5266-25620	team	{"plan": "monthly", "members": 5, "sessionId": "GPA.3306-1147-5266-25620"}
cmsjaowy00005en1futiwsfek	cmrxp6xwg0000d8j5pnl9zop9	Standard — 100 Flows	flow_addon	active	10	usd	t	stripe	2026-08-07 18:45:31.464	2026-09-07 18:45:28	2026-08-07 18:45:31.464	subscribed	\N	\N	pro	\N
\.


--
-- Data for Name: subscription_queue; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.subscription_queue (id, user_id, plan_id, payment_id, price, currency, permission, device_type, app_type, users_count, flows_count, sub_type, product_type, start_date, plan_endat, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.subscriptions (id, legacy_id, legacy_source, user_id, plan_id, payment_id, price, currency, permission, is_recurring, device_type, app_type, users_count, flows_count, sub_type, product_type, paid_app, free_trial, grace_period, started_at, status, expires_at, created_at, updated_at, deleted_at, scheduled_plan_type, scheduled_team_members, scheduled_activation_date, app_context, provider) FROM stdin;
cms9asm7d0022127trwetfchm	\N	\N	cmrxp6xwg0000d8j5pnl9zop9	cmpqgy2du000ach6ohbfeveek	rc_GPA.3306-1147-5266-25620	10	usd	\N	f	web	enterprise	5	\N	\N	team_monthly	f	\N	\N	2026-07-31 18:50:42.398	active	2026-08-31 18:50:42.371	2026-07-31 18:50:42.406	2026-07-31 18:50:43.255	\N	\N	\N	\N	free	google
\.


--
-- Data for Name: team_invites; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.team_invites (id, team_id, email, token, status, invited_by, accepted_by, role, app_context, expires_at, accepted_at, created_at) FROM stdin;
\.


--
-- Data for Name: team_members; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.team_members (id, user_id, team_id, role, app_type, created_at, updated_at, workspace_id, team_ids) FROM stdin;
cmsizj6fh00039zuad05fg5aj	cmrxp6xwg0000d8j5pnl9zop9	cmsizj6fg00019zua83qlc2fn	OWNER	\N	2026-08-07 13:33:08.045	\N	cmrxp6xwg0000d8j5pnl9zop9	{cmsizj6fg00019zua83qlc2fn,cmsj0p8dk00021xyk2udsbks8}
cmsj694cn00013dmdyx1qmflt	cmshogbjz0006unig73ya73rp	\N	MEMBER	\N	2026-08-07 16:41:16.103	\N	cmrxp6xwg0000d8j5pnl9zop9	{cmsj0p8dk00021xyk2udsbks8}
cmsj92yrx000ctzwgto49a335	cmshogbjz0006unig73ya73rp	\N	OWNER	\N	2026-08-07 18:00:27.789	\N	cmshogbjz0006unig73ya73rp	{cmsj92yrw000atzwg5456gfxb}
\.


--
-- Data for Name: teams; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.teams (id, legacy_id, name, description, team_owner_id, team_mem, count_mem, app_type, app_context, verify_team, status, created_at, updated_at, deleted_at) FROM stdin;
cmsj92yrw000atzwg5456gfxb	\N	Spiderman's Pro Team	\N	cmshogbjz0006unig73ya73rp	0	1	\N	pro	system	active	2026-08-07 18:00:27.788	\N	\N
cmsj0p8dk00021xyk2udsbks8	\N	Infinity	\N	cmrxp6xwg0000d8j5pnl9zop9	0	3	\N	team	\N	active	2026-08-07 14:05:50.12	\N	\N
cmsizj6fg00019zua83qlc2fn	\N	test123's Pro Team	\N	cmrxp6xwg0000d8j5pnl9zop9	0	1	\N	pro	system	active	2026-08-07 13:33:08.044	\N	\N
\.


--
-- Data for Name: transaction_logs; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.transaction_logs (id, legacy_id, legacy_source, user_id, charge_id, txn_id, amount_charged, payment_method, holder_name, currency, status, app_type, app_context, created_at, updated_at, deleted_at, purchase_type) FROM stdin;
cmpx3co3o000m55tghowda4wf	\N	\N	\N	cs_test_a1Sn6ppyO59tPIR5ZIOuT9PKvk8PKQCK6bKvVLmS1memZSBqM88ovvJLX8	cs_test_a1Sn6ppyO59tPIR5ZIOuT9PKvk8PKQCK6bKvVLmS1memZSBqM88ovvJLX8	4995	card	\N	usd	success	enterprise	team	2026-06-02 20:29:42.274	\N	\N	\N
cmq51oam900165qtppvwthir7	\N	\N	\N	pi_3Tg033C7d3AtqqII2MaktA59	cs_test_a1bkdJSev00uJoHkHGBDPOimeZeGzbyAn8sP3dKRtjBYD4PvQCo79L8uLT	800	card	\N	usd	success	enterprise	team	2026-06-08 10:04:54.85	\N	\N	ai_addon_credits
cmq51qig1001a5qtps38h6vgm	\N	\N	\N	pi_3Tg04jC7d3AtqqII0aDmENMj	cs_test_a12GjU0YQ0gAf4c64MHPteVoRA2UmAKc6lau3ufZGn1ZEDWz0f8ePvKFlI	800	card	\N	usd	success	enterprise	team	2026-06-08 10:06:38.305	\N	\N	ai_addon_credits
cmq51r38f001e5qtplovpjc4l	\N	\N	\N	pi_3Tg05AC7d3AtqqII2JnOUugj	cs_test_a1Edj3v1wnf6NHv2UwM1GRNWXO0NmBrCmSuRNWx2DxBhjVIHJmTpJFcneh	800	card	\N	usd	success	enterprise	team	2026-06-08 10:07:05.247	\N	\N	ai_addon_credits
cmq5251rd001q5qtptfzoxpk9	\N	\N	\N	cs_test_a1yUp0RFTAbkxgwgPt9vxrjIyXileA85fraInx7D2lhCcp2fChbJb6x4rO	cs_test_a1yUp0RFTAbkxgwgPt9vxrjIyXileA85fraInx7D2lhCcp2fChbJb6x4rO	1000	card	\N	usd	success	enterprise	team	2026-06-08 10:17:56.516	\N	\N	\N
cmq94jha7001ato55swp58iem	\N	\N	\N	pi_3Th2DnC7d3AtqqII1ce3vO3Y	cs_test_a1cj0mjbzDuWvqMTTG9APzVuReKe8jI6fjAXXcIqCGL0pNk4HR8Sxf1aBh	500	card	\N	usd	success	enterprise	team	2026-06-11 06:36:13.76	\N	\N	ai_addon_credits
cmq94mk0k001mto55as5xuqe8	\N	\N	\N	cs_test_a1EB9tQ0FpjrPatZGSiBvCwPSIvebsneQXFMUCGOU4HNHk9ehSIVJ9z2ST	cs_test_a1EB9tQ0FpjrPatZGSiBvCwPSIvebsneQXFMUCGOU4HNHk9ehSIVJ9z2ST	100000	card	\N	usd	success	enterprise	team	2026-06-11 06:38:37.267	\N	\N	\N
cmq9cygc10080to5579h1p6hd	\N	\N	\N	pi_3Th5tkC7d3AtqqII0G6IUgLy	cs_test_a1jPUckJAL3Qnjwbf9iEeeBbZoVLTSmFxfye9eRGy7CUvrfjOnMvsb5b0j	800	card	\N	usd	success	enterprise	team	2026-06-11 10:31:49.297	\N	\N	ai_addon_credits
cmq9d0jf6008cto55cz2jzne2	\N	\N	\N	cs_test_a12P8hndC71ynJmjlrntsDW8USKeJq7xs4OstZnsiK9E5UvwrLvcMdyL1K	cs_test_a12P8hndC71ynJmjlrntsDW8USKeJq7xs4OstZnsiK9E5UvwrLvcMdyL1K	1000	card	\N	usd	success	enterprise	team	2026-06-11 10:33:26.608	\N	\N	\N
cmr9585kq000e9ycpse7mq8nu	\N	\N	\N	cs_test_a1gzpNN4WvhS7CT6W3gOxEvYXsrmjQkS8ezaAB83cvs41i8oDtJ5iWcoTo	cs_test_a1gzpNN4WvhS7CT6W3gOxEvYXsrmjQkS8ezaAB83cvs41i8oDtJ5iWcoTo	1000	card	\N	usd	success	enterprise	team	2026-07-06 11:35:07.32	\N	\N	\N
cmpqsraii000nw9nngz39ed4v	\N	\N	\N	cs_test_a1Ff3oAD8PQd9X5wcta4NIo4MX5PHUCcoCwEIzj9WTRgBDTb9sMdd0PCzp	cs_test_a1Ff3oAD8PQd9X5wcta4NIo4MX5PHUCcoCwEIzj9WTRgBDTb9sMdd0PCzp	9990	card	\N	usd	success	enterprise	team	2026-05-29 10:46:31.655	\N	\N	\N
cmq2ap8o200015qtplz710ehj	\N	\N	\N	pi_3TfInqC7d3AtqqII1ekeZr4w	cs_test_a1SQqjQJBnFOwzZGpZHfUiA12FDCjYDgXoxFvFtAHLjqMYL7nqplobBn5A	800	card	\N	usd	success	enterprise	team	2026-06-06 11:54:16.993	\N	\N	ai_addon_credits
cmqv87dmj000ilxr74okryu26	\N	\N	\N	pi_3TmdsmC7d3AtqqII1NZPSIGM	cs_test_a1EzTVJbGcdyG1Q0vXstjTNtX6vVwGjep3SYDqSgJidS6u0xWsYKic6uzd	500	card	\N	usd	success	enterprise	team	2026-06-26 17:49:43.481	\N	\N	ai_addon_credits
cmr0txhgr00019og7m1nzh2nc	\N	\N	\N	sub_1To41dC7d3AtqqIIZQ0UMSEz	sub_1To41dC7d3AtqqIIZQ0UMSEz	0	card	\N	usd	success	individual	pro	2026-06-30 15:56:44.331	\N	\N	flow_addon
cmr2ggteu0001r6uygkfg6lj0	\N	\N	\N	sub_1ToTbRC7d3AtqqII9e4Ce5qg	sub_1ToTbRC7d3AtqqII9e4Ce5qg	0	card	\N	usd	success	individual	pro	2026-07-01 19:15:24.006	\N	\N	flow_addon
cmr35od3e000113z63e9ycy9o	\N	\N	\N	sub_1ToecNC7d3AtqqIIOdJouWOW	sub_1ToecNC7d3AtqqIIOdJouWOW	2000	card	\N	usd	success	individual	pro	2026-07-02 07:01:06.506	\N	\N	flow_addon
cmr3pjjzw000b13fs7iqnea5s	\N	\N	\N	cs_test_a1m7SNkuKS3vKrY1CoWBCbNgW7JXnBM9wP93uUluEPoTCh2PWHI8sLt6Ls	cs_test_a1m7SNkuKS3vKrY1CoWBCbNgW7JXnBM9wP93uUluEPoTCh2PWHI8sLt6Ls	1000	card	\N	usd	success	enterprise	team	2026-07-02 16:17:14.491	\N	\N	\N
cmr3t5otf0005bofbf9s0p91y	\N	\N	\N	in_1ToosUC7d3AtqqIIH1DwiVX8	in_1ToosUC7d3AtqqIIH1DwiVX8	998	card	\N	usd	success	enterprise	team	2026-07-02 17:58:26.019	\N	\N	team_subscription
cmr4iszvu0001heml21xpvdv5	\N	\N	\N	sub_1Tp05JC7d3AtqqIIaCcPmaMZ	sub_1Tp05JC7d3AtqqIIaCcPmaMZ	1000	card	\N	usd	success	individual	pro	2026-07-03 05:56:23.851	\N	\N	flow_addon
cmr4jbgvv0001yq9pbh33u3o5	\N	\N	\N	sub_1Tp0JCC7d3AtqqIIKhGCOicX	sub_1Tp0JCC7d3AtqqIIKhGCOicX	1000	card	\N	usd	success	individual	pro	2026-07-03 06:10:45.691	\N	\N	flow_addon
cmr8u77j70007qcfotkay2ytl	\N	\N	\N	cs_test_a1wVHCzK9cQijusstPlTirFOb1g4BerumNwJIn9VRVSQ9uSVlBgDpcd5Qk	cs_test_a1wVHCzK9cQijusstPlTirFOb1g4BerumNwJIn9VRVSQ9uSVlBgDpcd5Qk	2000	card	\N	usd	success	enterprise	team	2026-07-06 06:26:27.426	\N	\N	\N
cmr8ub7y80007osszkikiz5xo	\N	\N	\N	cs_test_a19BDHtP3hmtVGmkWdtPVQGPtSWF4DuWjjdT4C8JZd4K0i14dcz1Yv3E7L	cs_test_a19BDHtP3hmtVGmkWdtPVQGPtSWF4DuWjjdT4C8JZd4K0i14dcz1Yv3E7L	2000	card	\N	usd	success	enterprise	team	2026-07-06 06:29:34.59	\N	\N	\N
cmrd5x3hl0009ynwvnjck5akc	\N	\N	\N	cs_test_a18hnp39kpmqj2Xk65l4mKHJD8SQK9svHcvZwyd0HnixKoDtwhgVmMjHhT	cs_test_a18hnp39kpmqj2Xk65l4mKHJD8SQK9svHcvZwyd0HnixKoDtwhgVmMjHhT	1000	card	\N	usd	success	enterprise	team	2026-07-09 07:05:35.72	\N	\N	\N
cmrd60fwr000jynwvlnsssha9	\N	\N	\N	pi_3TrC41C7d3AtqqII17hHnlNC	cs_test_a1ADViBFxZkU365jpaYe58CFg6b642c2YrxsPu42eSp1yVoYuC24WOdfVC	500	card	\N	usd	success	individual	pro	2026-07-09 07:08:11.788	\N	\N	\N
cmrd7d6090009y7khq7ppmuu3	\N	\N	\N	cs_test_a1YEqCyoIYGZaixcHiGBlkGEX4NJ0oUbExoSds2eAKReqFpQwHkqaUQo7w	cs_test_a1YEqCyoIYGZaixcHiGBlkGEX4NJ0oUbExoSds2eAKReqFpQwHkqaUQo7w	1000	card	\N	usd	success	enterprise	team	2026-07-09 07:46:05.097	\N	\N	\N
cmrd7ecvm000ny7khmv1tlcc0	\N	\N	\N	pi_3TrCfbC7d3AtqqII2EADUiTU	cs_test_a110AJ1bwaRYEydvh9pjQdU5mHuJZejFfsus20J0Z02AFwTtD3DnRQXn1d	500	card	\N	usd	success	individual	pro	2026-07-09 07:47:00.659	\N	\N	\N
cmrjcbu0t0007sefomuyar3wr	\N	\N	\N	pi_3TslChC7d3AtqqII2BIOt0Y1	cs_test_a1yuzp6w4zN16ydFTOmR5ouap4RGhLKCdoeERgfuvuZXDL0nqSDfXmoqzq	500	card	\N	usd	success	individual	pro	2026-07-13 14:51:38.045	\N	\N	\N
cmrlqc8k5000bzro2kjckdfft	\N	\N	\N	1000000-SIM-1	1000000-SIM-1	0	in_app_purchase	\N	usd	success	enterprise	team	2026-07-15 06:59:23.861	\N	\N	\N
cmrs0ooga001xmrz6d4rf34j4	\N	\N	\N	cs_test_a1Tq4p32f5RmXQFt9szlOuoOYwlLLpIlfldXuMSqz6wXEzcy6Zjew9c5Qa	cs_test_a1Tq4p32f5RmXQFt9szlOuoOYwlLLpIlfldXuMSqz6wXEzcy6Zjew9c5Qa	1000	card	\N	usd	success	enterprise	team	2026-07-19 16:35:37.545	\N	\N	\N
cmrt30z6m000jmt7pu1wml7h5	\N	\N	\N	pi_3TvERIC7d3AtqqII1zeArN7a	cs_test_a1oQznCGK1xhDxldQNPzqmetvmKRRUOk8w8P30ym5K2egXhPSdm89v9JIy	500	card	\N	usd	success	individual	pro	2026-07-20 10:28:56.734	\N	\N	\N
cms9asm7g0026127t67h4zd6y	\N	\N	cmrxp6xwg0000d8j5pnl9zop9	GPA.3306-1147-5266-25620	GPA.3306-1147-5266-25620	0	in_app_purchase	\N	usd	success	enterprise	team	2026-07-31 18:50:42.406	\N	\N	\N
cmsizj6fm00079zua2oyp6t5d	\N	\N	cmrxp6xwg0000d8j5pnl9zop9	pi_3U1ntPC7d3AtqqII160lffd3	cs_test_a11n4wSv2i4JGGsw5YIN7m9TrB99ikPPRgGqUFHMCyqtGdJQr2egtZvA6D	500	card	\N	usd	success	individual	pro	2026-08-07 13:33:08.05	\N	\N	pro_upgrade
cmsj92ys2000gtzwgym7ptqye	\N	\N	cmshogbjz0006unig73ya73rp	pi_3U1s49C7d3AtqqII0zpZPI7N	cs_test_a1x6YH9QPa3WDrReIxKY0CWZdUkN39PM7EbpGBwS62qYEGJjshybDwb5X8	500	card	\N	usd	success	individual	pro	2026-08-07 18:00:27.794	\N	\N	pro_upgrade
cmsjaowxw0003en1fxhn9ms21	\N	\N	cmrxp6xwg0000d8j5pnl9zop9	sub_1U1sloC7d3AtqqIIYaB3tjAi	sub_1U1sloC7d3AtqqIIYaB3tjAi	1000	card	\N	usd	success	individual	pro	2026-08-07 18:45:31.46	\N	\N	flow_addon
\.


--
-- Data for Name: user_actions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.user_actions (id, action, action_model, action_id, user_id, created_at, updated_at, app_context, details) FROM stdin;
cmshstcey000sl555s3tlhq8l	team_member_removed	Team	\N	cmrxp6xwg0000d8j5pnl9zop9	2026-08-06 17:37:18.874	2026-08-06 17:37:18.874	team	\N
cmsj64n7a0005vqocrdckwyan	team_member_removed	Team	\N	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 16:37:47.254	2026-08-07 16:37:47.254	team	\N
cmsj6ciem00016kuhwn86og6i	team_member_removed	Team	\N	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 16:43:54.286	2026-08-07 16:43:54.286	team	\N
cmsj7jy5a000211rwomlajr1x	team_member_removed	Team	\N	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 17:17:40.894	2026-08-07 17:17:40.894	team	\N
cmsj8w6270001tzwg5uw4r55o	team_member_removed	Team	\N	cmrxp6xwg0000d8j5pnl9zop9	2026-08-07 17:55:10.639	2026-08-07 17:55:10.639	team	\N
cmsk1mgby000511ytlyl2qube	flow_collaborator_edit	Flow	\N	cmshogbjz0006unig73ya73rp	2026-08-08 07:19:26.254	2026-08-08 07:19:26.254	team	{"flowId": "cmsjy4avw0007ynj3rqrlb3hx", "message": "spiderman123 edited shared flow \\"new teststs\\" owned by test123 (Version #2)", "version": 2, "editorId": "cmshogbjz0006unig73ya73rp", "workspaceId": "cmrxp6xwg0000d8j5pnl9zop9"}
cmsk1y49h000911ythksnap8w	flow_collaborator_edit	Flow	\N	cmshogbjz0006unig73ya73rp	2026-08-08 07:28:30.485	2026-08-08 07:28:30.485	team	{"flowId": "cmsjy4avw0007ynj3rqrlb3hx", "message": "spiderman123 edited shared flow \\"new teststs\\" owned by test123 (Version #3)", "version": 3, "editorId": "cmshogbjz0006unig73ya73rp", "workspaceId": "cmrxp6xwg0000d8j5pnl9zop9"}
cmsk1ybjq000d11ytuzxu4y0a	flow_collaborator_edit	Flow	\N	cmshogbjz0006unig73ya73rp	2026-08-08 07:28:39.926	2026-08-08 07:28:39.926	team	{"flowId": "cmsjy4avw0007ynj3rqrlb3hx", "message": "spiderman123 edited shared flow \\"new teststs\\" owned by test123 (Version #4)", "version": 4, "editorId": "cmshogbjz0006unig73ya73rp", "workspaceId": "cmrxp6xwg0000d8j5pnl9zop9"}
\.


--
-- Data for Name: user_devices; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.user_devices (id, user_id, ip_hash, ua_hash, last_seen, created_at) FROM stdin;
cmsde20ln0005aplxjnlvm001	cmrxp6xwg0000d8j5pnl9zop9	5c2a3f8f4c6f5559f3df13f4c2497729623d823fafba70ba7aa909a82c99e843	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-08-08 09:16:45.642	2026-08-03 15:33:04.523
cmsjcbvql0001h0xdal1gyqep	cmshogbjz0006unig73ya73rp	30ad08c0c9ee957fabe5d9d4a2ede5994740d92f388b16e281dfd14a316729e9	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-07 19:31:22.606	2026-08-07 19:31:22.606
cms4v7wgj000e5ensr1vl2a30	cms2uqs670000cb5ckamr8k1i	d8afe52497aac575af636eb787f081654265398d8c7c6833340ef694e10db6a0	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-07-29 10:24:12.395	2026-07-28 16:23:36.979
cmsikqnui000tleqfkiud982d	cmshogbjz0006unig73ya73rp	5c2a3f8f4c6f5559f3df13f4c2497729623d823fafba70ba7aa909a82c99e843	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-08-08 05:16:11.45	2026-08-07 06:39:02.97
cms8jgo0n0001127ti0w9cioj	cmrxp6xwg0000d8j5pnl9zop9	245c0ffc0f6a0215471542b9add1fa5331647f4af18c431f039c66dbee92732e	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-06 08:20:28.751	2026-07-31 06:05:35.255
cmr0p96o80001enu6lwdiiw04	cmpqkkbd5000121k228ai47n6	4e73a25351065e2b4628603507468bae8762ca9c65e9ec82736506215b68b0be	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-06-30 13:53:02.882	2026-06-30 13:45:52.136
cmr0qwfvm0001o04silqnuo5r	cmpqkkbd5000121k228ai47n6	77f30e0c7d6e9f303167dc953e4f1ad56bd3fd24d47706e67ed8761dc3229dca	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-06-30 14:31:56.77	2026-06-30 14:31:56.77
cms2uru4c0004cb5croljckif	cms2uqs670000cb5ckamr8k1i	5c2a3f8f4c6f5559f3df13f4c2497729623d823fafba70ba7aa909a82c99e843	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-07-27 06:35:35.1	2026-07-27 06:35:35.1
cmshrdiph0009h65o4xa7jrkn	cmrxp6xwg0000d8j5pnl9zop9	99d06f5bdcffa65fefa817d965115a95c186172fdbf46e3fd5aaa6dcb87ebf02	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-06 17:39:55.314	2026-08-06 16:57:00.918
cms2ur9dm0002cb5cto3on61e	cms2uqs670000cb5ckamr8k1i	245c0ffc0f6a0215471542b9add1fa5331647f4af18c431f039c66dbee92732e	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-07-27 07:11:04.482	2026-07-27 06:35:08.218
cmshdflqo0001unigyvuu2xf5	cmrxp6xwg0000d8j5pnl9zop9	4e73a25351065e2b4628603507468bae8762ca9c65e9ec82736506215b68b0be	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-06 15:38:23.423	2026-08-06 10:26:43.536
cmshr98490001h65omaq674bx	cmshogbjz0006unig73ya73rp	99d06f5bdcffa65fefa817d965115a95c186172fdbf46e3fd5aaa6dcb87ebf02	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-06 17:40:22.758	2026-08-06 16:53:40.569
cms8jh9900003127t776i2ti5	cmrxp6xwg0000d8j5pnl9zop9	d8afe52497aac575af636eb787f081654265398d8c7c6833340ef694e10db6a0	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-08-06 16:19:41.869	2026-07-31 06:06:02.772
cmshrb06d0003h65oyvjfgnqc	cmshogbjz0006unig73ya73rp	d8afe52497aac575af636eb787f081654265398d8c7c6833340ef694e10db6a0	dc60ee6031b80d360434fdb31afce81b79f46682d4a5de51902bf6d1254a08ee	2026-08-06 16:55:03.59	2026-08-06 16:55:03.59
cmshd5sam00011305khdeb1za	cmrxp6xwg0000d8j5pnl9zop9	32503aed20f3c75eb3e7d0cd4e039a07e3485bb02bc010e0a734759dfc9a765c	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-07 05:59:23.087	2026-08-06 10:19:05.471
cmsijbnka0001leqfd5tvvk4t	cmshogbjz0006unig73ya73rp	32503aed20f3c75eb3e7d0cd4e039a07e3485bb02bc010e0a734759dfc9a765c	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-07 05:59:23.146	2026-08-07 05:59:23.146
cmsj5ppkm0001vqoc29d3pdm7	cmsj5pgj40000fd7ad4uj6q7d	30ad08c0c9ee957fabe5d9d4a2ede5994740d92f388b16e281dfd14a316729e9	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-07 16:26:26.156	2026-08-07 16:26:10.486
cmsj5q1pk0003vqocxf9kn3fl	cmsj5pgry0000invl265wcegv	30ad08c0c9ee957fabe5d9d4a2ede5994740d92f388b16e281dfd14a316729e9	8f42af6f304383bbe22bc11b9f1c9ce77bb37478b15b0b0d93224e249f36e68e	2026-08-07 16:26:26.216	2026-08-07 16:26:26.216
\.


--
-- Data for Name: user_free_trials; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.user_free_trials (id, user_id, pro_monthly, team_monthly, pro_yearly, team_yearly, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_interests; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.user_interests (id, user_id, user_occupation, user_interest, legacy_source, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.users (id, name, email, "emailVerified", verify_token, verify_token_expires_at, image, password, remember_token, role, legacy_vs_id, legacy_ent_id, legacy_ind_id, contact_no, photo, user_type, user_status, client_type, welcome_user, company_id, stripe_customer_id, has_pro, pro_purchased_at, pro_flow_limit, pro_additional_flows_purchased, pro_unlimited_flows, active_flow_pack_id, flow_pack_expires_at, is_in_flow_picker_phase, flow_addon_stripe_sub_id, flow_addon_plan, flow_addon_status, flow_addon_current_period_end, current_version, is_legacy_pro, refresh_token, p_flow_read, p_flow_modify, p_user_read, p_user_modify, p_shape_read, p_shape_modify, chat_enabled, role_id, admin_note, suspended_at, suspended_by, created_at, updated_at, last_seen, last_active_team_id, is_legacy_bcrypt, last_active_pro_team_id, flow_addon_grace_period_end, is_in_team_picker_phase, team_flow_limit, team_unlimited_flows) FROM stdin;
cmsj5pgj40000fd7ad4uj6q7d	wsowner	wsowner@verify.local	2026-08-07 16:25:58.725	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$A7FhyaoFZHCsZvsj21eFnQ$l45SEXs6GAu8496/sgMeOoJ82TfZEMV6BGtZIn1MkwU	\N	Viewer	\N	\N	\N	\N	\N	free_user	success	web	t	\N	\N	f	\N	10	0	f	\N	\N	f	\N	\N	\N	\N	free	f	\N	f	f	f	f	f	f	f	\N	\N	\N	\N	2026-08-07 16:25:58.767	2026-08-07 16:25:58.767	\N	\N	f	\N	\N	f	50	f
cmsj5pgry0000invl265wcegv	wsmember	wsmember@verify.local	2026-08-07 16:25:59.048	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$mOTGrQmS+sTHbBmOT+Yvbg$gQjzpnE2UBdNxUJ/zvmCY7Sp74ZzBOdomTVHQFED4kg	\N	Viewer	\N	\N	\N	\N	\N	free_user	success	web	t	\N	\N	f	\N	10	0	f	\N	\N	f	\N	\N	\N	\N	free	f	\N	f	f	f	f	f	f	f	\N	\N	\N	\N	2026-08-07 16:25:59.085	2026-08-07 16:25:59.085	\N	\N	f	\N	\N	f	50	f
cmpqkkbd5000121k228ai47n6	Super Admin	superadmin@valuechart.com	2026-05-29 07:51:50.428	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$B5NzUCKYClBkyIRudZiK4Q$xqpyQpw4EW6ixl22SwImFZ44KFhe+Nn19hPMD2UY7nk	\N	super_admin	\N	\N	\N	\N	\N	admin	success	web	t	\N	\N	f	\N	10	0	f	\N	\N	f	\N	\N	\N	\N	free	f	\N	f	f	f	f	f	f	f	cmpqgy2d30000ch6oif585n3b	\N	\N	\N	2026-05-29 06:57:09.256	2026-05-29 07:51:50.43	\N	\N	f	\N	\N	f	50	f
cmrxp6xwg0000d8j5pnl9zop9	test123	test123@gmail.com	2026-07-31 06:05:20.439	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$bGzs4Ldd1cgEr2O8xcvY1A$q5j2R45gBxl7Cunl4tElDIMaTX+ZqEQzUJNCfw2Mvo0	\N	Viewer	\N	\N	\N	\N	\N	free_user	success	web	t	\N	cus_UwIDszi0UlMIo4	t	2026-08-07 13:33:08.036	100	0	f	\N	\N	f	sub_1U1sloC7d3AtqqIIYaB3tjAi	standard_100	active	2026-09-07 18:45:28	free	f	\N	f	f	f	f	f	f	f	\N	\N	\N	\N	2026-07-23 16:00:31.264	2026-08-08 09:42:52.417	2026-08-08 07:56:03.841	\N	f	\N	\N	f	50	t
cmshogbjz0006unig73ya73rp	spiderman123	spiderman123@gmail.com	2026-08-07 19:16:21.868	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$bTF2hq8Mh2aV8HrxPAX4qA$rmX7tlt+THOPHiOMiQVl2v/TGGGRVJbSOG2NKUtwE0A	\N	Viewer	\N	\N	\N		data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADIABwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCSfXPHK26aw+r+I1hK7EvDczbdrMRtD56FozxnkofSprXWPiLcatpumN4j8R2s2pvEtq1xfTorrK21HBzyhPcZ6Gqcup2MelW0UUMrzwsSPNkSSMAnJAjaM7eQM5JB545qhpOu3On69Y6pIZLpbXUI75o3k5mdHDfM2MknBGTnGSccnNH57GpaSvN9L6/eeu/8K5+MSux/4T2SRkAYINWu8N14yVAzx6/WvNNe1Xxf4G1OTwuNa1GzNmqEwWl/IkUZkUSEAKQM/PzjjOevU+j/APDQyofl8GIMMX41HHJ6n/Ve9eN+PPEM/ivxbqHiC4t47Z7twREhJCKqhVGT1O1Rk8ZOTgdKnU9LGVMNGCeHm3L57fP5H2zqN/FbzpbJIkl40MlxHZrIiyzpHtDbQxHAMkYJyACygkbqoeEb24v/AO0ZpLfVrSNbpo1ttRhCyRuOXKMGIeIkgqcnB3AHbtC6n2h/RaRZmVQoAwBjnJNB9c1qmeYQ+O/jO2h3V3J8BvLv47mGOCy/4S60PnRMspkl8zbhdjJEu08t5uR9016zVfz3zjaM/Sk89/RaB3Oa1bwd4f1XWhrF/ZzS3yRtHFOLyZWhDhQ/lhWAjLKiqWTBYZBOCQb2maLZ6bIZLebUZGMfl4udRnuBjcWziR2Gcsfm64wM4AAW917Q7LV7fR73WtMttSuQpt7Sa7jSaUMxVdqEhmyQQMDqKrND4kN/eWw1zRA7gyWkP9nP5kUeHA8z/SP3nzbMkBMhWHBYMr1EW9QgbUBJaubyCGeCWJyFhdByoBIcNkkZwMFcbtwBwKtwRmKFYzLJMVGDJIRuc9ycADn2AHoAKjhke2Wys9RvLRtQnTaNmIhO6rlzGjMxxwTtyxA6k9assCpwRg0hW1uRGCMytKNyuyhWZXIJAzgcHoMn8zWJr2reHdO1ezj1fXrezuPKkeOCe5VSUVTI0h3fMqqsLndkLwc5IGOgdQI1YGRiWAKoVGATjPzdh19eOM1FcqEuYlSO7lBGC8ckYVcso5BIJ4JPAPCnHOAQbRWjTTrq8leOSOa6tJFilZZdzwvs3BW5yp2S5APOJM9G5uAYGMk+5JJ/M1I8aAAh5G5AwCnc4zz6df5U11CthW3Ad6AC7u9Ls5Viu7y1t5GRpFSWYKSoxlgCegyMn3FWvJj/ALv61BLp9lNqUOozWdrJd26ssE7QgyxBvvBXPIB7gdatU3YFe7uZS6z4ebV5NHXV9ObUo5FjksxdJ5yO0bSKpTO4EojuBjlVY9Aa0vJj/u/rXOr4Zu01o3MWrRxacZDK1imnwgFydxbfjO4y5kz/AHiT710tDS6DRVSJnUMCMGl+zv6rUtt/qR+P86kpBYrfZ39VqN1KsVPUVdqpP/rm/D+VAD1Fyi7VCY9x/wDXpc3fpH+X/wBepycev5VHvkM6qqL5W0lmJIYNkYAGMEfeyc8YHBzwDGZu/SP8v/r0wxzMSzKMn0q1RQAUEZBAJHuO1RfaE9GpsskEsTxSx+ZG6lXRlBDA9QR3FAD7WN4beOKS4luHUYMsgUM/udoAz9AKkqL7Qno1H2hPRqAK1mlxJLN50USQAjyXSUsz/wB7cpUBcHpgtn26VZ+zp6tVaLyVUmSF5WL/APPLOB7HHT9ev0p4a3IBa0cEgcGDp+Q7UCRJ5A34/hx13c5+mKgJQnMbBkOCrA5BBAOaLiaGLbs06afIP3IRx7fNig7d7bF2rngbcdvSgCFF1SOdvKa0EBcttNu28jaAMtuxnOTnHTAxxkvmS7+0yXNtHDHLJEsbM6M+dpJXoRwNz/mOeKn1G/t7BEe4E5DlgohgeViVRnPCAnohx6nAGSQDkRT61c7ntPEegSR3SNNYldPd8xEPtbIuP3gBktyWXaCFYceYpjdna4tL2NK4fU2z9nNvH8mBviZsNhueGGRkqcexGeQQ8rIzFmQgnsB7VEbx7SSc31wk4MsKxR2tpI0kayFYwXClyQZN534VVXO7hGetEcjIpFWMy80nQbzVINVvNJ0+41C3AEN1Laq0sYBJAVyMjBJPB7moJvD3heae3nm0HSpZbWJYbd3soy0Ma/dRCV+VRk4A4GTU+nG6uZbwXFobaOGfy7eQurfaE2IxkAHK/Mzpg8/JnoRUjS2iX62D3kK3TpvSIuodhzyFzkjg84oaurME2ndFcaJ4cGuf27/Y2m/2t/z/AH2RPtH3dv8ArMbvu/L16cVqedH/AHv0qqvliSKCWaOO4lQusJYbiBjcQO4BYZPuPWm4cMyuFBDEcHOR2P5Y/wDr0CuZ954n0LTJ2tL3XdJtJoz80U90iOueRkFgRwc1h6x4k0S9uVltvidZ6WgQKYra6smUnJ+YmVHOeccHHA4654b4l/CvxH4m8Y32sWN7pcdtceXsSaWQONsaqcgIR1U96i0/4XeMGjuItf1WLVY5ITBGg1ZlWNGYM4xLbSjllQgrtIK5+jPInisW5yh7PS+j1/Q9NtvG3haG2iil8Z6FcOiBWlkvoA0hA+8QpAyevAA9AK17C+tNTtVvrG7t7y3lzsmt5A8bYODggkHBBH1BrwDVvgz8QNVWzXUNb0O4Flbra2+6aQFIlJKpkRZIGTjNexfDPQbvwx4I0/Q757eS4tvN3tASUO6V3GCQD0YdqRvhcRiKk3GpDlVtzo7nTp5bqS4TV9QgLgBUj8vZGBjOAyHOcdTk+hA4qW6lnjuoRG1r5RBDrI5Vy25cFevRfMOMckLyOTRRQkj0b3Jo5BMkc0Esbwum5WX5gwOCCCDjGPzzUlFFAH//2Q==	free_user	success	web	t	\N	cus_V1vv344CdvfnpE	t	2026-08-07 18:00:27.784	10	0	f	\N	\N	f	\N	\N	\N	\N	pro	f	\N	f	f	f	f	f	f	f	\N	\N	\N	\N	2026-08-06 15:35:12.767	2026-08-08 09:50:14.399	2026-08-08 09:33:24.747	\N	f	\N	\N	f	50	f
cms2uqs670000cb5ckamr8k1i	Notif Verify	notifverify@test.com	2026-07-27 06:35:08.1	\N	\N	\N	$argon2id$v=19$m=65536,t=3,p=4$OmahxcAvkVnw1Miu68227g$w6wjDjIv6kRAHR8iW80bN6zY8XKSx93qlpO6VLyGNcM	\N	Viewer	\N	\N	\N	\N	\N	free_user	success	web	t	\N	\N	f	\N	10	0	f	\N	\N	f	\N	\N	\N	\N	free	f	\N	f	f	f	f	f	f	f	\N	\N	\N	\N	2026-07-27 06:34:45.918	2026-07-29 09:30:51.314	\N	qa-team-01	f	\N	\N	f	50	f
\.


--
-- Data for Name: users_app; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.users_app (id, user_id, app_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: vsm_options; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.vsm_options (id, legacy_id, legacy_source, title, type, unit, company_id, team_id, created_by_id, app_type, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: webhook_events; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.webhook_events (id, provider, event_id, type, processed_at) FROM stdin;
cmqus2lhn0000hqtzj56xnwdh	stripe	evt_1TmWpmC7d3AtqqIIPjKcsph7	invoice.paid	2026-06-26 10:18:06.524
cmqus2lmj0001hqtzupfpesax	stripe	evt_1TmWpmC7d3AtqqIIggurowB7	checkout.session.completed	2026-06-26 10:18:06.715
cmqus2lmm0002hqtzwwkd9tyf	stripe	evt_1TmWpmC7d3AtqqIIk7tXVIkt	invoice.payment_succeeded	2026-06-26 10:18:06.719
cmqusua0x0003hqtzgk6acuek	stripe	evt_1TmXAbC7d3AtqqIICQxMqn1I	customer.subscription.updated	2026-06-26 10:39:38.049
cmqusuhge0004hqtzty1v2zeh	stripe	evt_1TmXAlC7d3AtqqII2k1RWpxl	customer.subscription.updated	2026-06-26 10:39:47.678
cmqusuhzo0005hqtzu9hiv4mx	stripe	evt_1TmXAmC7d3AtqqIIODSGQG98	customer.subscription.updated	2026-06-26 10:39:48.373
cmqusv5790006hqtz9x53y7nx	stripe	evt_1TmXBGC7d3AtqqIIly9iO14O	checkout.session.completed	2026-06-26 10:40:18.453
cmqusv59a0007hqtzkatnfybu	stripe	evt_1TmXBGC7d3AtqqIIeoHDwU63	invoice.paid	2026-06-26 10:40:18.527
cmqusv5sf0008hqtzx62u3hnx	stripe	evt_1TmXBHC7d3AtqqIIvdXj4k0M	invoice.payment_succeeded	2026-06-26 10:40:19.216
cmqusyy1p0009hqtz55tp13vy	stripe	evt_1TmXE7C7d3AtqqIIQ1uJffaY	checkout.session.completed	2026-06-26 10:43:15.805
cmqusyy5p000ahqtz9dmuoh7t	stripe	evt_1TmXE7C7d3AtqqIIwxzykTXW	invoice.paid	2026-06-26 10:43:15.949
cmqusyyxk000bhqtz3t8mwkoh	stripe	evt_1TmXE8C7d3AtqqII3rZXkZ5v	invoice.payment_succeeded	2026-06-26 10:43:16.952
cmqutc37o000chqtzoku9lutd	stripe	evt_1TmXO0C7d3AtqqIIp5x3e3wp	checkout.session.completed	2026-06-26 10:53:29.029
cmqutpokj000fhqtzh7g6f2o4	stripe	evt_1TmXYEC7d3AtqqIIIaMugHG8	customer.subscription.deleted	2026-06-26 11:04:03.235
cmqutpppl000ghqtzi4p0l12j	stripe	evt_1TmXYGC7d3AtqqII1dfLvtfu	customer.subscription.deleted	2026-06-26 11:04:04.713
cmqutppty000hhqtzges2qixt	stripe	evt_1TmXYGC7d3AtqqIIHwDn2LPj	customer.subscription.deleted	2026-06-26 11:04:04.87
cmqutppun000ihqtzbv4w7aa6	stripe	evt_1TmXYGC7d3AtqqIIlASKZv84	customer.subscription.deleted	2026-06-26 11:04:04.895
cmqutpq0s000jhqtz686gq30a	stripe	evt_1TmXYGC7d3AtqqIInzjjFEy4	customer.subscription.deleted	2026-06-26 11:04:05.117
cmqutsdp0000khqtzy7dwyuu2	stripe	evt_1TmXaGC7d3AtqqII3Mi7trr4	checkout.session.completed	2026-06-26 11:06:09.108
cmqutsdra000lhqtzpey1iufz	stripe	evt_1TmXaGC7d3AtqqIIm3lsLt44	invoice.paid	2026-06-26 11:06:09.19
cmqutse9h000mhqtzf3nlio32	stripe	evt_1TmXaHC7d3AtqqII6IlCFzO3	invoice.payment_succeeded	2026-06-26 11:06:09.845
cmquttxf1000nhqtz7fbwl6zm	stripe	evt_1TmXbQC7d3AtqqIIa69aQhRn	checkout.session.completed	2026-06-26 11:07:21.312
cmquu3dvg000qhqtz1xauxy8s	stripe	evt_1TmXiYC7d3AtqqIIvuBZHYHM	checkout.session.completed	2026-06-26 11:14:42.556
cmquuc5rx000thqtzb8qa2aq8	stripe	evt_1TmXp9C7d3AtqqII0RdJd9mg	checkout.session.completed	2026-06-26 11:21:31.966
cmquuddwd000whqtzyq95ykw3	stripe	evt_1TmXq4C7d3AtqqIIwsDQVuhk	checkout.session.completed	2026-06-26 11:22:29.149
cmquv9pqy000zhqtzhgja9nxm	stripe	evt_1TmYEPC7d3AtqqII2hD7tpZo	customer.subscription.updated	2026-06-26 11:47:37.499
cmquvaf4a0010hqtzt00ukuyg	stripe	evt_1TmYEwC7d3AtqqIItxFmWFwP	customer.subscription.updated	2026-06-26 11:48:10.378
cmquvbuls0011hqtz002xg8lu	stripe	evt_1TmYG0C7d3AtqqII55r3wX2c	customer.subscription.deleted	2026-06-26 11:49:17.103
cmquvf4g00012hqtz6b5bwndv	stripe	evt_1TmYITC7d3AtqqIIhRKiw64b	invoice.paid	2026-06-26 11:51:49.824
cmquvf4l90013hqtziqh2ispf	stripe	evt_1TmYITC7d3AtqqIIuLtrfPaq	checkout.session.completed	2026-06-26 11:51:50.013
cmquvf4v80014hqtz2746rupy	stripe	evt_1TmYIUC7d3AtqqIImVMwrDEu	invoice.payment_succeeded	2026-06-26 11:51:50.373
cmquvk2at0015hqtzhdxdr9kk	stripe	evt_1TmYMBC7d3AtqqIImbg1Wfx1	checkout.session.completed	2026-06-26 11:55:40.325
cmqv1qex00018hqtzbqiilts2	stripe	evt_1Tmb3VC7d3AtqqIIr3nMOkKs	checkout.session.completed	2026-06-26 14:48:34.296
cmqv1tsqb001bhqtz7s84l3n8	stripe	evt_1Tmb63C7d3AtqqIISKbaNkI1	checkout.session.completed	2026-06-26 14:51:12.179
cmqv1vbzb001ehqtzu5vmzdl7	stripe	evt_1Tmb7DC7d3AtqqIIvxF2gSkE	checkout.session.completed	2026-06-26 14:52:23.783
cmqv1wh1u001fhqtzq72066u0	stripe	evt_1Tmb84C7d3AtqqIIMxrDZr1S	checkout.session.completed	2026-06-26 14:53:17.011
cmqv37iif001ghqtzoa8qt6pe	stripe	evt_1TmbhTC7d3AtqqIIO6nhFTdY	checkout.session.completed	2026-06-26 15:29:51.722
cmqv4cmii001hhqtzfiezj11r	stripe	evt_1TmcCPC7d3AtqqIIYx6Blj2a	checkout.session.completed	2026-06-26 16:01:49.805
cmqv4cmla001ihqtzqyspf0xi	stripe	evt_1TmcCPC7d3AtqqIIiBGkCM5P	invoice.paid	2026-06-26 16:01:49.918
cmqv4cmy0001khqtzyjo2kwuf	stripe	evt_1TmcCQC7d3AtqqIINJY2bBLO	invoice.payment_succeeded	2026-06-26 16:01:50.377
cmqv4xyxp001lhqtzm0lap1bg	stripe	evt_1TmcSTC7d3AtqqIIr5npPp5Y	checkout.session.completed	2026-06-26 16:18:25.679
cmqv5g5vl001ohqtz3ypcv40o	stripe	evt_1TmcgAC7d3AtqqIIMDehQg5v	checkout.session.completed	2026-06-26 16:32:34.484
cmqv5sozl001rhqtzhyqfxxlv	stripe	evt_1TmcpaC7d3AtqqIIlpnCOIa5	checkout.session.completed	2026-06-26 16:42:19.124
cmqv6495i001uhqtzwecozufn	stripe	evt_1TmcyIC7d3AtqqIIihmcjpEe	checkout.session.completed	2026-06-26 16:51:18.471
cmqv649bf001vhqtzwn8kjop0	stripe	evt_1TmcyIC7d3AtqqIIgPFeLotd	invoice.paid	2026-06-26 16:51:18.699
cmqv64a1m001xhqtz6e8933ih	stripe	evt_1TmcyJC7d3AtqqIIBeAxxech	invoice.payment_succeeded	2026-06-26 16:51:19.643
cmqv676md001yhqtzxpuk7l4b	stripe	evt_1Tmd0UC7d3AtqqIIBfRfR7fr	invoice.paid	2026-06-26 16:53:35.173
cmqv676yp001zhqtz4t7i9wk7	stripe	evt_1Tmd0VC7d3AtqqIIdOjE8pyW	invoice.payment_succeeded	2026-06-26 16:53:35.617
cmqv677410020hqtzznil922h	stripe	evt_1Tmd0VC7d3AtqqII0sA4M1xj	checkout.session.completed	2026-06-26 16:53:35.81
cmqv87dlt000glxr7t153p848	stripe	evt_1TmdspC7d3AtqqIIjDtfb5SM	checkout.session.completed	2026-06-26 17:49:43.457
cmqvdwjpr000rlxr70x1ganq5	stripe	evt_1TmgNDC7d3AtqqIIkZVAVu7P	customer.subscription.updated	2026-06-26 20:29:15.855
cmqvdx12v000slxr7zhyjhi53	stripe	evt_1TmgNZC7d3AtqqIIWF9Z1yRV	customer.subscription.updated	2026-06-26 20:29:38.359
\.


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: Session Session_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);


--
-- Name: add_user_subscriptions add_user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.add_user_subscriptions
    ADD CONSTRAINT add_user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_consent ai_consent_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_consent
    ADD CONSTRAINT ai_consent_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_credit_balances ai_credit_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_credit_balances
    ADD CONSTRAINT ai_credit_balances_pkey PRIMARY KEY (id);


--
-- Name: ai_credit_usages ai_credit_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_credit_usages
    ADD CONSTRAINT ai_credit_usages_pkey PRIMARY KEY (id);


--
-- Name: ai_jobs ai_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: apps apps_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.apps
    ADD CONSTRAINT apps_pkey PRIMARY KEY (id);


--
-- Name: chat_files chat_files_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_files
    ADD CONSTRAINT chat_files_pkey PRIMARY KEY (id);


--
-- Name: chat_group_users chat_group_users_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_group_users
    ADD CONSTRAINT chat_group_users_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: chat_group_users chat_group_users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_group_users
    ADD CONSTRAINT chat_group_users_pkey PRIMARY KEY (id);


--
-- Name: chat_groups chat_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);


--
-- Name: chat_message_users chat_message_users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_message_users
    ADD CONSTRAINT chat_message_users_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: contact_submissions contact_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.contact_submissions
    ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);


--
-- Name: conversation_users conversation_users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.conversation_users
    ADD CONSTRAINT conversation_users_pkey PRIMARY KEY (user_id, conversation_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: feedback_queries feedback_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.feedback_queries
    ADD CONSTRAINT feedback_queries_pkey PRIMARY KEY (id);


--
-- Name: firebase_users firebase_users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.firebase_users
    ADD CONSTRAINT firebase_users_pkey PRIMARY KEY (id);


--
-- Name: flow_group_users flow_group_users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_group_users
    ADD CONSTRAINT flow_group_users_pkey PRIMARY KEY (id);


--
-- Name: flow_limits flow_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_limits
    ADD CONSTRAINT flow_limits_pkey PRIMARY KEY (id);


--
-- Name: flow_publishes flow_publishes_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_publishes
    ADD CONSTRAINT flow_publishes_pkey PRIMARY KEY (id);


--
-- Name: flow_shares flow_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_shares
    ADD CONSTRAINT flow_shares_pkey PRIMARY KEY (id);


--
-- Name: flow_versions flow_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_pkey PRIMARY KEY (id);


--
-- Name: flows flows_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_pkey PRIMARY KEY (id);


--
-- Name: iap_transactions iap_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.iap_transactions
    ADD CONSTRAINT iap_transactions_pkey PRIMARY KEY (id);


--
-- Name: issue_list issue_list_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.issue_list
    ADD CONSTRAINT issue_list_pkey PRIMARY KEY (id);


--
-- Name: message_notifications message_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_notifications
    ADD CONSTRAINT message_notifications_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_quiet_hours notification_quiet_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notification_quiet_hours
    ADD CONSTRAINT notification_quiet_hours_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (id);


--
-- Name: password_resets password_resets_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: pro_flow_purchases pro_flow_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.pro_flow_purchases
    ADD CONSTRAINT pro_flow_purchases_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: promocodes promocodes_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.promocodes
    ADD CONSTRAINT promocodes_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shape_groups shape_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shape_groups
    ADD CONSTRAINT shape_groups_pkey PRIMARY KEY (id);


--
-- Name: shapes shapes_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_pkey PRIMARY KEY (id);


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (id);


--
-- Name: subscription_queue subscription_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscription_queue
    ADD CONSTRAINT subscription_queue_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: team_invites team_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: transaction_logs transaction_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.transaction_logs
    ADD CONSTRAINT transaction_logs_pkey PRIMARY KEY (id);


--
-- Name: user_actions user_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_pkey PRIMARY KEY (id);


--
-- Name: user_devices user_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_pkey PRIMARY KEY (id);


--
-- Name: user_free_trials user_free_trials_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_free_trials
    ADD CONSTRAINT user_free_trials_pkey PRIMARY KEY (id);


--
-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


--
-- Name: users_app users_app_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users_app
    ADD CONSTRAINT users_app_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vsm_options vsm_options_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.vsm_options
    ADD CONSTRAINT vsm_options_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: Account_provider_providerAccountId_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");


--
-- Name: Session_sessionToken_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX "Session_sessionToken_key" ON public."Session" USING btree ("sessionToken");


--
-- Name: VerificationToken_identifier_token_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON public."VerificationToken" USING btree (identifier, token);


--
-- Name: VerificationToken_token_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX "VerificationToken_token_key" ON public."VerificationToken" USING btree (token);


--
-- Name: admin_logs_admin_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX admin_logs_admin_id_idx ON public.admin_logs USING btree (admin_id);


--
-- Name: admin_logs_created_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX admin_logs_created_at_idx ON public.admin_logs USING btree (created_at);


--
-- Name: admin_logs_target_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX admin_logs_target_user_id_idx ON public.admin_logs USING btree (target_user_id);


--
-- Name: ai_consent_user_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ai_consent_user_id_key ON public.ai_consent USING btree (user_id);


--
-- Name: ai_conversations_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_conversations_user_id_idx ON public.ai_conversations USING btree (user_id);


--
-- Name: ai_credit_balances_user_id_app_context_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ai_credit_balances_user_id_app_context_key ON public.ai_credit_balances USING btree (user_id, app_context);


--
-- Name: ai_credit_balances_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_credit_balances_user_id_idx ON public.ai_credit_balances USING btree (user_id);


--
-- Name: ai_credit_usages_created_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_credit_usages_created_at_idx ON public.ai_credit_usages USING btree (created_at);


--
-- Name: ai_credit_usages_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_credit_usages_user_id_idx ON public.ai_credit_usages USING btree (user_id);


--
-- Name: ai_jobs_status_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_jobs_status_idx ON public.ai_jobs USING btree (status);


--
-- Name: ai_jobs_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_jobs_user_id_idx ON public.ai_jobs USING btree (user_id);


--
-- Name: ai_messages_conversation_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ai_messages_conversation_id_idx ON public.ai_messages USING btree (conversation_id);


--
-- Name: apps_legacy_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX apps_legacy_id_key ON public.apps USING btree (legacy_id);


--
-- Name: chat_files_message_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_files_message_id_idx ON public.chat_files USING btree (message_id);


--
-- Name: chat_group_users_group_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_group_users_group_id_idx ON public.chat_group_users USING btree (group_id);


--
-- Name: chat_group_users_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_group_users_user_id_idx ON public.chat_group_users USING btree (user_id);


--
-- Name: chat_groups_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_groups_app_context_idx ON public.chat_groups USING btree (app_context);


--
-- Name: chat_groups_team_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_groups_team_id_idx ON public.chat_groups USING btree (team_id);


--
-- Name: chat_groups_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_groups_user_id_idx ON public.chat_groups USING btree (user_id);


--
-- Name: chat_groups_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_groups_workspace_id_idx ON public.chat_groups USING btree (workspace_id);


--
-- Name: chat_groups_workspace_id_team_id_app_context_is_workspace_r_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX chat_groups_workspace_id_team_id_app_context_is_workspace_r_key ON public.chat_groups USING btree (workspace_id, team_id, app_context, is_workspace_room);


--
-- Name: chat_message_users_msg_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_message_users_msg_id_idx ON public.chat_message_users USING btree (msg_id);


--
-- Name: chat_message_users_receiver_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_message_users_receiver_id_idx ON public.chat_message_users USING btree (receiver_id);


--
-- Name: chat_messages_group_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_messages_group_id_idx ON public.chat_messages USING btree (group_id);


--
-- Name: chat_messages_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX chat_messages_user_id_idx ON public.chat_messages USING btree (user_id);


--
-- Name: contact_submissions_created_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX contact_submissions_created_at_idx ON public.contact_submissions USING btree (created_at);


--
-- Name: contact_submissions_source_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX contact_submissions_source_idx ON public.contact_submissions USING btree (source);


--
-- Name: firebase_users_user_id_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX firebase_users_user_id_app_context_idx ON public.firebase_users USING btree (user_id, app_context);


--
-- Name: firebase_users_user_id_fcm_token_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX firebase_users_user_id_fcm_token_key ON public.firebase_users USING btree (user_id, fcm_token);


--
-- Name: firebase_users_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX firebase_users_user_id_idx ON public.firebase_users USING btree (user_id);


--
-- Name: flow_group_users_flow_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_group_users_flow_id_idx ON public.flow_group_users USING btree (flow_id);


--
-- Name: flow_group_users_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_group_users_user_id_idx ON public.flow_group_users USING btree (user_id);


--
-- Name: flow_limits_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_limits_user_id_idx ON public.flow_limits USING btree (user_id);


--
-- Name: flow_publishes_flow_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_publishes_flow_id_idx ON public.flow_publishes USING btree (flow_id);


--
-- Name: flow_shares_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_shares_app_context_idx ON public.flow_shares USING btree (app_context);


--
-- Name: flow_shares_flow_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_shares_flow_id_idx ON public.flow_shares USING btree (flow_id);


--
-- Name: flow_shares_flow_id_shared_with_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX flow_shares_flow_id_shared_with_key ON public.flow_shares USING btree (flow_id, shared_with);


--
-- Name: flow_shares_shared_with_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_shares_shared_with_idx ON public.flow_shares USING btree (shared_with);


--
-- Name: flow_versions_flow_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_versions_flow_id_idx ON public.flow_versions USING btree (flow_id);


--
-- Name: flow_versions_saved_by_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flow_versions_saved_by_id_idx ON public.flow_versions USING btree (saved_by_id);


--
-- Name: flows_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_app_context_idx ON public.flows USING btree (app_context);


--
-- Name: flows_app_type_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_app_type_idx ON public.flows USING btree (app_type);


--
-- Name: flows_creator_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_creator_id_idx ON public.flows USING btree (creator_id);


--
-- Name: flows_last_modified_by_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_last_modified_by_id_idx ON public.flows USING btree (last_modified_by_id);


--
-- Name: flows_legacy_id_legacy_source_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_legacy_id_legacy_source_idx ON public.flows USING btree (legacy_id, legacy_source);


--
-- Name: flows_project_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_project_id_idx ON public.flows USING btree (project_id);


--
-- Name: flows_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX flows_workspace_id_idx ON public.flows USING btree (workspace_id);


--
-- Name: iap_transactions_event_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX iap_transactions_event_id_key ON public.iap_transactions USING btree (event_id);


--
-- Name: iap_transactions_product_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX iap_transactions_product_id_idx ON public.iap_transactions USING btree (product_id);


--
-- Name: iap_transactions_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX iap_transactions_user_id_idx ON public.iap_transactions USING btree (user_id);


--
-- Name: issue_list_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX issue_list_app_context_idx ON public.issue_list USING btree (app_context);


--
-- Name: issue_list_flow_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX issue_list_flow_id_idx ON public.issue_list USING btree (flow_id);


--
-- Name: issue_list_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX issue_list_workspace_id_idx ON public.issue_list USING btree (workspace_id);


--
-- Name: message_notifications_user_id_message_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX message_notifications_user_id_message_id_idx ON public.message_notifications USING btree (user_id, message_id);


--
-- Name: message_reactions_message_id_user_id_emoji_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX message_reactions_message_id_user_id_emoji_key ON public.message_reactions USING btree (message_id, user_id, emoji);


--
-- Name: messages_conversation_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX messages_conversation_id_idx ON public.messages USING btree (conversation_id);


--
-- Name: messages_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX messages_user_id_idx ON public.messages USING btree (user_id);


--
-- Name: notification_preferences_user_id_category_app_context_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX notification_preferences_user_id_category_app_context_key ON public.notification_preferences USING btree (user_id, category, app_context);


--
-- Name: notification_preferences_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX notification_preferences_user_id_idx ON public.notification_preferences USING btree (user_id);


--
-- Name: notification_quiet_hours_user_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX notification_quiet_hours_user_id_key ON public.notification_quiet_hours USING btree (user_id);


--
-- Name: notifications_created_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at);


--
-- Name: notifications_user_id_is_read_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX notifications_user_id_is_read_idx ON public.notifications USING btree (user_id, is_read);


--
-- Name: notifications_user_id_workspace_id_is_read_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX notifications_user_id_workspace_id_is_read_idx ON public.notifications USING btree (user_id, workspace_id, is_read);


--
-- Name: notifications_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX notifications_workspace_id_idx ON public.notifications USING btree (workspace_id);


--
-- Name: password_resets_email_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX password_resets_email_idx ON public.password_resets USING btree (email);


--
-- Name: plans_app_type_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX plans_app_type_idx ON public.plans USING btree (app_type);


--
-- Name: plans_name_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX plans_name_key ON public.plans USING btree (name);


--
-- Name: pro_flow_purchases_expires_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX pro_flow_purchases_expires_at_idx ON public.pro_flow_purchases USING btree (expires_at);


--
-- Name: pro_flow_purchases_status_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX pro_flow_purchases_status_idx ON public.pro_flow_purchases USING btree (status);


--
-- Name: pro_flow_purchases_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX pro_flow_purchases_user_id_idx ON public.pro_flow_purchases USING btree (user_id);


--
-- Name: projects_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX projects_app_context_idx ON public.projects USING btree (app_context);


--
-- Name: projects_created_by_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX projects_created_by_idx ON public.projects USING btree (created_by);


--
-- Name: projects_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX projects_workspace_id_idx ON public.projects USING btree (workspace_id);


--
-- Name: roles_legacy_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX roles_legacy_id_key ON public.roles USING btree (legacy_id);


--
-- Name: shape_groups_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shape_groups_app_context_idx ON public.shape_groups USING btree (app_context);


--
-- Name: shape_groups_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shape_groups_workspace_id_idx ON public.shape_groups USING btree (workspace_id);


--
-- Name: shapes_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shapes_app_context_idx ON public.shapes USING btree (app_context);


--
-- Name: shapes_associated_chat_group_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shapes_associated_chat_group_id_idx ON public.shapes USING btree (associated_chat_group_id);


--
-- Name: shapes_associated_team_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shapes_associated_team_id_idx ON public.shapes USING btree (associated_team_id);


--
-- Name: shapes_group_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shapes_group_id_idx ON public.shapes USING btree (group_id);


--
-- Name: shapes_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX shapes_workspace_id_idx ON public.shapes USING btree (workspace_id);


--
-- Name: subscription_history_archived_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscription_history_archived_at_idx ON public.subscription_history USING btree (archived_at);


--
-- Name: subscription_history_user_id_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscription_history_user_id_app_context_idx ON public.subscription_history USING btree (user_id, app_context);


--
-- Name: subscription_history_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscription_history_user_id_idx ON public.subscription_history USING btree (user_id);


--
-- Name: subscriptions_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscriptions_app_context_idx ON public.subscriptions USING btree (app_context);


--
-- Name: subscriptions_app_type_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscriptions_app_type_idx ON public.subscriptions USING btree (app_type);


--
-- Name: subscriptions_payment_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscriptions_payment_id_idx ON public.subscriptions USING btree (payment_id);


--
-- Name: subscriptions_status_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscriptions_status_idx ON public.subscriptions USING btree (status);


--
-- Name: subscriptions_status_product_type_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX subscriptions_status_product_type_idx ON public.subscriptions USING btree (status, product_type);


--
-- Name: subscriptions_user_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX subscriptions_user_id_key ON public.subscriptions USING btree (user_id);


--
-- Name: team_invites_email_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_invites_email_idx ON public.team_invites USING btree (email);


--
-- Name: team_invites_team_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_invites_team_id_idx ON public.team_invites USING btree (team_id);


--
-- Name: team_invites_token_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_invites_token_idx ON public.team_invites USING btree (token);


--
-- Name: team_invites_token_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX team_invites_token_key ON public.team_invites USING btree (token);


--
-- Name: team_members_team_ids_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_members_team_ids_idx ON public.team_members USING gin (team_ids);


--
-- Name: team_members_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_members_user_id_idx ON public.team_members USING btree (user_id);


--
-- Name: team_members_user_id_workspace_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX team_members_user_id_workspace_id_key ON public.team_members USING btree (user_id, workspace_id);


--
-- Name: team_members_workspace_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX team_members_workspace_id_idx ON public.team_members USING btree (workspace_id);


--
-- Name: teams_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX teams_app_context_idx ON public.teams USING btree (app_context);


--
-- Name: teams_team_owner_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX teams_team_owner_id_idx ON public.teams USING btree (team_owner_id);


--
-- Name: transaction_logs_charge_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX transaction_logs_charge_id_idx ON public.transaction_logs USING btree (charge_id);


--
-- Name: transaction_logs_txn_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX transaction_logs_txn_id_key ON public.transaction_logs USING btree (txn_id);


--
-- Name: transaction_logs_user_id_app_context_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX transaction_logs_user_id_app_context_idx ON public.transaction_logs USING btree (user_id, app_context);


--
-- Name: transaction_logs_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX transaction_logs_user_id_idx ON public.transaction_logs USING btree (user_id);


--
-- Name: user_actions_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX user_actions_user_id_idx ON public.user_actions USING btree (user_id);


--
-- Name: user_devices_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX user_devices_user_id_idx ON public.user_devices USING btree (user_id);


--
-- Name: user_devices_user_id_ip_hash_ua_hash_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX user_devices_user_id_ip_hash_ua_hash_key ON public.user_devices USING btree (user_id, ip_hash, ua_hash);


--
-- Name: user_free_trials_user_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX user_free_trials_user_id_key ON public.user_free_trials USING btree (user_id);


--
-- Name: user_interests_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX user_interests_user_id_idx ON public.user_interests USING btree (user_id);


--
-- Name: users_app_app_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX users_app_app_id_idx ON public.users_app USING btree (app_id);


--
-- Name: users_app_user_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX users_app_user_id_idx ON public.users_app USING btree (user_id);


--
-- Name: users_company_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX users_company_id_idx ON public.users USING btree (company_id);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_legacy_vs_id_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX users_legacy_vs_id_idx ON public.users USING btree (legacy_vs_id);


--
-- Name: users_suspended_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX users_suspended_at_idx ON public.users USING btree (suspended_at);


--
-- Name: webhook_events_processed_at_idx; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX webhook_events_processed_at_idx ON public.webhook_events USING btree (processed_at);


--
-- Name: webhook_events_provider_event_id_key; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX webhook_events_provider_event_id_key ON public.webhook_events USING btree (provider, event_id);


--
-- Name: Account Account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Session Session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: add_user_subscriptions add_user_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.add_user_subscriptions
    ADD CONSTRAINT add_user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: add_user_subscriptions add_user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.add_user_subscriptions
    ADD CONSTRAINT add_user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: admin_logs admin_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_consent ai_consent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_consent
    ADD CONSTRAINT ai_consent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_credit_balances ai_credit_balances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_credit_balances
    ADD CONSTRAINT ai_credit_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_credit_usages ai_credit_usages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_credit_usages
    ADD CONSTRAINT ai_credit_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_jobs ai_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_files chat_files_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_files
    ADD CONSTRAINT chat_files_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_group_users chat_group_users_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_group_users
    ADD CONSTRAINT chat_group_users_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_group_users chat_group_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_group_users
    ADD CONSTRAINT chat_group_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_groups chat_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_groups chat_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_message_users chat_message_users_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_message_users
    ADD CONSTRAINT chat_message_users_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_message_users chat_message_users_msg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_message_users
    ADD CONSTRAINT chat_message_users_msg_id_fkey FOREIGN KEY (msg_id) REFERENCES public.chat_messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_message_users chat_message_users_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_message_users
    ADD CONSTRAINT chat_message_users_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_message_users chat_message_users_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_message_users
    ADD CONSTRAINT chat_message_users_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversation_users conversation_users_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.conversation_users
    ADD CONSTRAINT conversation_users_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: conversation_users conversation_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.conversation_users
    ADD CONSTRAINT conversation_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: feedback_queries feedback_queries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.feedback_queries
    ADD CONSTRAINT feedback_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: firebase_users firebase_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.firebase_users
    ADD CONSTRAINT firebase_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_group_users flow_group_users_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_group_users
    ADD CONSTRAINT flow_group_users_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: flow_group_users flow_group_users_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_group_users
    ADD CONSTRAINT flow_group_users_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_group_users flow_group_users_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_group_users
    ADD CONSTRAINT flow_group_users_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.shape_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_group_users flow_group_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_group_users
    ADD CONSTRAINT flow_group_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_limits flow_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_limits
    ADD CONSTRAINT flow_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_publishes flow_publishes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_publishes
    ADD CONSTRAINT flow_publishes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_publishes flow_publishes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_publishes
    ADD CONSTRAINT flow_publishes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_shares flow_shares_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_shares
    ADD CONSTRAINT flow_shares_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_shares flow_shares_shared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_shares
    ADD CONSTRAINT flow_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_shares flow_shares_shared_with_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_shares
    ADD CONSTRAINT flow_shares_shared_with_fkey FOREIGN KEY (shared_with) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_versions flow_versions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.flows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flow_versions flow_versions_saved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flow_versions
    ADD CONSTRAINT flow_versions_saved_by_id_fkey FOREIGN KEY (saved_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: flows flows_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: flows flows_last_modified_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_last_modified_by_id_fkey FOREIGN KEY (last_modified_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: flows flows_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: flows flows_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: iap_transactions iap_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.iap_transactions
    ADD CONSTRAINT iap_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: issue_list issue_list_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.issue_list
    ADD CONSTRAINT issue_list_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: issue_list issue_list_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.issue_list
    ADD CONSTRAINT issue_list_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_notifications message_notifications_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_notifications
    ADD CONSTRAINT message_notifications_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_notifications message_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_notifications
    ADD CONSTRAINT message_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notification_quiet_hours notification_quiet_hours_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notification_quiet_hours
    ADD CONSTRAINT notification_quiet_hours_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pro_flow_purchases pro_flow_purchases_renewed_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.pro_flow_purchases
    ADD CONSTRAINT pro_flow_purchases_renewed_from_id_fkey FOREIGN KEY (renewed_from_id) REFERENCES public.pro_flow_purchases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pro_flow_purchases pro_flow_purchases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.pro_flow_purchases
    ADD CONSTRAINT pro_flow_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projects projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: projects projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shape_groups shape_groups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shape_groups
    ADD CONSTRAINT shape_groups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shape_groups shape_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shape_groups
    ADD CONSTRAINT shape_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shapes shapes_associated_chat_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_associated_chat_group_id_fkey FOREIGN KEY (associated_chat_group_id) REFERENCES public.chat_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: shapes shapes_associated_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_associated_team_id_fkey FOREIGN KEY (associated_team_id) REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: shapes shapes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.shape_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: shapes shapes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: shapes shapes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.shapes
    ADD CONSTRAINT shapes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscription_history subscription_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscription_history
    ADD CONSTRAINT subscription_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscription_queue subscription_queue_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscription_queue
    ADD CONSTRAINT subscription_queue_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscription_queue subscription_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscription_queue
    ADD CONSTRAINT subscription_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: team_invites team_invites_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: team_invites team_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: team_invites team_invites_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: team_members team_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: teams teams_team_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_team_owner_id_fkey FOREIGN KEY (team_owner_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: transaction_logs transaction_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.transaction_logs
    ADD CONSTRAINT transaction_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_actions user_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_actions
    ADD CONSTRAINT user_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_devices user_devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_devices
    ADD CONSTRAINT user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_free_trials user_free_trials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_free_trials
    ADD CONSTRAINT user_free_trials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_interests user_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users_app users_app_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users_app
    ADD CONSTRAINT users_app_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.apps(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users_app users_app_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users_app
    ADD CONSTRAINT users_app_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: vsm_options vsm_options_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.vsm_options
    ADD CONSTRAINT vsm_options_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: admin
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict Wx4mrzbQmRLDd5HbbcF2UEmbNFVLTSpOBta7HOrCoEPSdE7ZVy7J7ND8m93wIMW

