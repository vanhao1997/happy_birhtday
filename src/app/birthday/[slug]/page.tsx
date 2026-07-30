import { BirthdayExperience } from "@/components/birthday/BirthdayExperience";

export default async function BirthdayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return <BirthdayExperience slug={decodeURIComponent(slug)} />;
}
