import { notFound } from "next/navigation";

import { WorkshopAdminConsole, type AdminWorkshopArtist, type AdminWorkshopDemand, type AdminWorkshopReservation } from "@/components/admin/WorkshopAdminConsole";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "워크샵 관리 | deetz admin" };

export default async function AdminWorkshopsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const admin = createAdminClient();

  const [{ data: artists }, { data: demands }, { data: reservations }] = await Promise.all([
    admin
      .from("workshop_artists")
      .select(
        "id, slug, name, instagram_handle, image_url, country, genres, headline, description, status, deposit_amount, total_price, min_headcount, max_headcount, expected_period, recruit_deadline, recruit_opened_at, confirmed_at, possible_duplicate_of, handle_check_status, handle_checked_at, demand_notified_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("workshop_demands")
      .select("id, artist_id, source, contact_email, contact_instagram, user_id, comment, country_code, city, created_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    admin
      .from("workshop_reservations")
      .select(
        "id, artist_id, user_id, customer_name, customer_email, customer_phone, amount, status, pg_provider, order_no, paid_at, refunded_at, memo, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  return (
    <WorkshopAdminConsole
      artists={(artists ?? []) as AdminWorkshopArtist[]}
      demands={(demands ?? []) as AdminWorkshopDemand[]}
      reservations={(reservations ?? []) as AdminWorkshopReservation[]}
    />
  );
}
