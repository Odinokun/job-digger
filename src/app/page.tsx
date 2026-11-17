import { getTranslations } from "next-intl/server";

export default async function JobsPage() {
  const t = await getTranslations("JobsPage");

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-muted">{t("empty")}</p>
    </>
  );
}
