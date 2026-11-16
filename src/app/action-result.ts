/**
 * Чим закінчилася спроба виконати роботу Server Action.
 *
 * Окремо від результатів самої задачі (`AddCompanyResult` і подібних): ті
 * описують очікувані відмови вводу, які інтерфейс показує полями форми, а цей
 * тип - неочікуваний збій, на який користувач нічого виправити не може.
 */
export type ActionOutcome<T> =
  { ok: true; value: T } | { ok: false; error: "unexpected" };

/**
 * Виконує роботу Server Action так, щоб неочікуваний збій став результатом.
 *
 * Виняток із action до інтерфейсу доходить калікою: у продакшні Next ховає
 * повідомлення, лишаючи лише `digest`, тож форма не має чого показати
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
 * Тому ловимо його тут: справжня помилка з усіма деталями лишається в лозі
 * сервера, а на клієнт їде лише код - деталі збою не мають значення для того,
 * хто натиснув кнопку, і не мають просочуватися в браузер.
 */
export async function runAction<T>(
  work: () => Promise<T> | T,
): Promise<ActionOutcome<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (failure) {
    // Лог англійською - технічне повідомлення, не текст інтерфейсу.
    console.error("Server action failed", failure);

    return { ok: false, error: "unexpected" };
  }
}
