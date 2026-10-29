/**
 * Whether the open chat is still empty (no messages). The header reads it when "Atmos" or "+" is
 * clicked: an empty chat already is a new chat, so it stays put instead of opening another one.
 */
let empty = false;

export const setCurrentChatEmpty = (value: boolean) => {
  empty = value;
};

export const isCurrentChatEmpty = () => empty;
