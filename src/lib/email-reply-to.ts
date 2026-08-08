/**
 * Adresse vers laquelle atterrissent les réponses des familles.
 *
 * Les emails partent depuis le domaine d'envoi Resend (`ce-agon.fr`), qui ne
 * reçoit pas de courrier : sans `replyTo`, un client qui clique sur
 * « Répondre » écrit dans le vide, sans rebond visible côté centre. Tous les
 * envois destinés aux familles doivent donc renvoyer vers cette boîte, qui est
 * celle branchée sur l'assistant de boîte de réception.
 *
 * Les emails purement internes (sauvegarde quotidienne, notification d'un
 * nouvel avis, message laissé à la borne) n'en ont pas besoin : ils arrivent
 * déjà dans la bonne boîte.
 */
export const REPLY_TO = process.env.RESEND_REPLY_TO || "ceagon50@gmail.com";
