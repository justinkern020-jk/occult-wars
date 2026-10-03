/**
 * Loading lore: one short, real occult fact or attested quotation, shown on
 * aged paper on the splash and while a match or era loads. Every line here is
 * history or a published text (no inventions), with its source. Rotates
 * without repeats through a session (see src/game/loadingLore.ts).
 */
export type LoreLine = {
  /** The fact, or the quotation (without quote marks). */
  text: string;
  /** Attribution: who said or wrote it, and where/when; or the fact's subject. */
  by: string;
  kind: 'quote' | 'fact';
};

export const LOADING_LORE: LoreLine[] = [
  // ---- attested quotations ----
  { kind: 'quote', text: 'That which is below is like that which is above, and that which is above is like that which is below.', by: 'The Emerald Tablet, in Isaac Newton’s translation' },
  { kind: 'quote', text: 'Do what thou wilt shall be the whole of the Law.', by: 'Aleister Crowley, The Book of the Law (1904)' },
  { kind: 'quote', text: 'Every man and every woman is a star.', by: 'Aleister Crowley, The Book of the Law (1904)' },
  { kind: 'quote', text: 'Magick is the Science and Art of causing Change to occur in conformity with Will.', by: 'Aleister Crowley, Magick in Theory and Practice (1929)' },
  { kind: 'quote', text: 'All things are poison, and nothing is without poison; only the dose makes a thing not a poison.', by: 'Paracelsus, Septem Defensiones (1538)' },
  { kind: 'quote', text: 'To know, to dare, to will, to keep silent.', by: 'Éliphas Lévi, the four words of the Sphinx, Dogme et Rituel de la Haute Magie (1854–56)' },
  { kind: 'quote', text: 'Newton was not the first of the age of reason. He was the last of the magicians.', by: 'John Maynard Keynes, “Newton, the Man” (1946)' },
  { kind: 'quote', text: 'There are more things in heaven and earth, Horatio, than are dreamt of in your philosophy.', by: 'William Shakespeare, Hamlet, Act I, Scene 5' },
  { kind: 'quote', text: 'The oldest and strongest emotion of mankind is fear, and the oldest and strongest kind of fear is fear of the unknown.', by: 'H. P. Lovecraft, Supernatural Horror in Literature (1927)' },
  { kind: 'quote', text: 'That is not dead which can eternal lie, and with strange aeons even death may die.', by: 'H. P. Lovecraft, “The Nameless City” (1921)' },
  { kind: 'quote', text: 'Pray, read, read, read, read again, work, and you will find.', by: 'Mutus Liber, the “Silent Book” of alchemy (La Rochelle, 1677)' },
  { kind: 'quote', text: 'Fay ce que vouldras. (Do what you will.)', by: 'The one rule of the Abbey of Thélème, Rabelais, Gargantua (1534)' },
  { kind: 'quote', text: 'Solve et coagula. (Dissolve and coagulate.)', by: 'Alchemical maxim, written on the arms of Lévi’s Baphomet (1856)' },
  { kind: 'quote', text: 'Visita Interiora Terrae Rectificando Invenies Occultum Lapidem: visit the interior of the earth, and by rectifying you will find the hidden stone.', by: 'V.I.T.R.I.O.L., an alchemists’ motto from the Basil Valentine writings' },

  // ---- the old masters ----
  { kind: 'fact', text: 'Cornelius Agrippa’s Three Books of Occult Philosophy were printed between 1531 and 1533 and became the great handbook of Renaissance magic.', by: 'Heinrich Cornelius Agrippa' },
  { kind: 'fact', text: 'Paracelsus gave us the word “gnome” for the elemental spirits of the earth.', by: 'Paracelsus, Liber de Nymphis' },
  { kind: 'fact', text: 'Marsilio Ficino set aside his Plato to translate the Corpus Hermeticum first, because Cosimo de’ Medici wanted Hermes read before he died. The Latin was finished in 1463.', by: 'The Corpus Hermeticum' },
  { kind: 'fact', text: 'Giordano Bruno, philosopher of an infinite universe and Hermetic memory arts, was burned in Rome’s Campo de’ Fiori on 17 February 1600.', by: 'Giordano Bruno' },
  { kind: 'fact', text: 'Johannes Trithemius’s Steganographia (written c. 1499) reads like a book of angel magic. Underneath, much of it is cryptography.', by: 'Johannes Trithemius' },
  { kind: 'fact', text: 'John Dee chose the date of Elizabeth I’s coronation by astrology: 15 January 1559.', by: 'John Dee' },
  { kind: 'fact', text: 'From 1582 John Dee and the scryer Edward Kelley recorded the “angelic” language now called Enochian.', by: 'John Dee and Edward Kelley' },
  { kind: 'fact', text: 'An Aztec obsidian mirror once owned by John Dee is held in the British Museum.', by: 'John Dee’s “shew-stone”' },
  { kind: 'fact', text: 'Emperor Rudolf II made Prague a magnet for alchemists. Edward Kelley died a prisoner in Bohemia in the late 1590s.', by: 'The court of Rudolf II' },
  { kind: 'fact', text: 'Nicolas Flamel was a real Parisian scrivener, d. 1418. His carved tombstone survives in the Musée de Cluny in Paris.', by: 'Nicolas Flamel' },
  { kind: 'fact', text: 'Nostradamus published the first edition of Les Prophéties in Lyon in 1555.', by: 'Michel de Nostredame' },
  { kind: 'fact', text: 'The Rosicrucian manifestos appeared in Germany: the Fama Fraternitatis in 1614, the Confessio in 1615 and the Chymical Wedding in 1616.', by: 'The Rosicrucian furore' },
  { kind: 'fact', text: 'Elias Ashmole, founder of Oxford’s Ashmolean Museum, was an astrologer and alchemist. His diary records his own Masonic initiation in 1646.', by: 'Elias Ashmole' },
  { kind: 'fact', text: 'Hennig Brand discovered phosphorus in 1669 by boiling down urine in search of the philosopher’s stone.', by: 'Hennig Brand of Hamburg' },
  { kind: 'fact', text: 'Isaac Newton wrote more than a million words on alchemy, most of them never published in his lifetime.', by: 'Isaac Newton' },
  { kind: 'fact', text: 'The Malleus Maleficarum, the witch-hunters’ manual by Heinrich Kramer, was first printed in 1486–87.', by: 'Malleus Maleficarum' },
  { kind: 'fact', text: 'At Salem in 1692, nineteen people were hanged for witchcraft, and Giles Corey was pressed to death under stones.', by: 'The Salem witch trials' },

  // ---- the nineteenth century ----
  { kind: 'fact', text: 'Éliphas Lévi’s Dogme et Rituel de la Haute Magie gave the world its best-known image of Baphomet, the winged goat of the Sabbath.', by: 'Éliphas Lévi (Alphonse-Louis Constant)' },
  { kind: 'fact', text: 'Modern Spiritualism began with rappings heard by the Fox sisters in Hydesville, New York, in 1848.', by: 'Kate and Margaret Fox' },
  { kind: 'fact', text: 'In 1888 Margaret Fox publicly confessed that the rappings were faked by cracking her toe joints. She retracted the confession the next year.', by: 'Margaret Fox' },
  { kind: 'fact', text: 'Spirit photographer William Mumler was tried for fraud in New York in 1869 and acquitted. Later he photographed Mary Todd Lincoln with a “ghost” of her husband.', by: 'William H. Mumler' },
  { kind: 'fact', text: 'The Theosophical Society was founded in New York in 1875 by Helena Blavatsky, Henry Steel Olcott and William Quan Judge.', by: 'The Theosophical Society' },
  { kind: 'fact', text: 'Blavatsky published Isis Unveiled in 1877 and The Secret Doctrine in 1888.', by: 'Helena Petrovna Blavatsky' },
  { kind: 'fact', text: 'The Society for Psychical Research was founded in London in 1882 to study séances, telepathy and apparitions by scientific method.', by: 'The Society for Psychical Research' },
  { kind: 'fact', text: 'The Hermetic Order of the Golden Dawn was founded in London in 1888 by William Wynn Westcott, S. L. MacGregor Mathers and William Robert Woodman.', by: 'The Golden Dawn' },
  { kind: 'fact', text: 'W. B. Yeats joined the Golden Dawn in 1890, more than thirty years before his Nobel Prize.', by: 'William Butler Yeats' },
  { kind: 'fact', text: 'Moina Mathers, Golden Dawn adept and wife of MacGregor Mathers, was born Mina Bergson, sister of the philosopher Henri Bergson.', by: 'Moina Mathers' },
  { kind: 'fact', text: 'In April 1900, in the “Battle of Blythe Road”, Aleister Crowley tried to seize the Golden Dawn’s vault in London on Mathers’s behalf.', by: 'The Golden Dawn schism' },
  { kind: 'fact', text: 'MacGregor Mathers translated The Key of Solomon the King (1889) and The Sacred Magic of Abramelin the Mage (1898).', by: 'S. L. MacGregor Mathers' },
  { kind: 'fact', text: 'Elijah Bond filed the patent for the Ouija board in 1890. It was granted on 10 February 1891.', by: 'The Ouija board' },
  { kind: 'fact', text: 'Physiologist Charles Richet coined the word “ectoplasm” for the stuff mediums seemed to exude. He won the Nobel Prize in 1913 for work on anaphylaxis.', by: 'Charles Richet' },

  // ---- the twentieth century, to the Leaden Hour ----
  { kind: 'fact', text: 'The Rider–Waite tarot was published in 1909. Its 78 cards were drawn by Pamela Colman Smith.', by: 'Pamela Colman Smith' },
  { kind: 'fact', text: 'Austin Osman Spare set out his method of sigils, letters fused into a single glyph, in The Book of Pleasure (1913).', by: 'Austin Osman Spare' },
  { kind: 'fact', text: 'Between 1906 and 1915 the Swedish painter Hilma af Klint made her Paintings for the Temple, which she said were commissioned by spirits she called the High Masters.', by: 'Hilma af Klint' },
  { kind: 'fact', text: 'In 1913 Carl Jung began the visions he recorded in the Red Book. It was not published until 2009.', by: 'C. G. Jung' },
  { kind: 'fact', text: 'Rudolf Steiner’s first Goetheanum, a vast carved-wood temple in Dornach, burned down on New Year’s Eve 1922.', by: 'Rudolf Steiner' },
  { kind: 'fact', text: 'Two girls photographed the “Cottingley Fairies” in 1917. Arthur Conan Doyle defended the photographs in print. In 1983 the cousins admitted the fairies were paper cut-outs.', by: 'Elsie Wright and Frances Griffiths' },
  { kind: 'fact', text: 'On their honeymoon in 1917, George Yeats began the automatic writing that became W. B. Yeats’s A Vision (1925).', by: 'George and W. B. Yeats' },
  { kind: 'fact', text: 'Crowley’s Abbey of Thelema at Cefalù, Sicily, ran from 1920 until Mussolini’s government expelled him in 1923.', by: 'The Abbey of Thelema' },
  { kind: 'fact', text: 'The London paper John Bull called Crowley “the wickedest man in the world” in 1923.', by: 'Aleister Crowley' },
  { kind: 'fact', text: 'Harry Houdini exposed fraudulent mediums in A Magician Among the Spirits (1924). He died on Halloween, 1926.', by: 'Harry Houdini' },
  { kind: 'fact', text: 'Bess Houdini held a séance for her husband every Halloween for ten years. The last, in 1936, was on a Hollywood rooftop. He did not come.', by: 'The Final Houdini Séance' },
  { kind: 'fact', text: 'Fulcanelli’s Le Mystère des Cathédrales was published in Paris in 1926, and Les Demeures Philosophales in 1930. No one has proved who he was.', by: 'Fulcanelli' },
  { kind: 'fact', text: 'Dion Fortune published Psychic Self-Defence in 1930, drawing on what she called a psychic attack in her own youth.', by: 'Dion Fortune' },
  { kind: 'fact', text: 'Harry Price called Borley Rectory “the most haunted house in England”. It was gutted by fire in 1939.', by: 'Borley Rectory' },
  { kind: 'fact', text: 'Lady Frieda Harris painted Crowley’s Thoth tarot between 1938 and 1943. The deck was not published until 1969.', by: 'The Thoth Tarot' },
  { kind: 'fact', text: 'In 1944 the medium Helen Duncan was jailed under Britain’s Witchcraft Act of 1735. The Act was repealed in 1951.', by: 'Helen Duncan' },
  { kind: 'fact', text: 'Jack Parsons, a founder of the Jet Propulsion Laboratory, was also a Thelemite. In 1946 he performed the “Babalon Working” with L. Ron Hubbard.', by: 'John Whiteside Parsons' },
  { kind: 'fact', text: 'The Voynich manuscript is named for the bookseller who bought it in 1912. Its vellum has been carbon-dated to the early 1400s, and no one can read it.', by: 'Beinecke Library, Yale, MS 408' },
  { kind: 'fact', text: 'Jacques Bergier said that in June 1937 Fulcanelli warned him about atomic weapons. Bergier and Louis Pauwels told the story in Le Matin des magiciens (1960).', by: 'Jacques Bergier' },
];
