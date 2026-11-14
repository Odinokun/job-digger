import { getTranslations } from "next-intl/server";

export default async function CompaniesPage() {
  const t = await getTranslations("CompaniesPage");

  return (
    <>
      <h1 className="font-sans text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500">{t("empty")}</p>
    </>
  );
}
