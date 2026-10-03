/**
 * The Codex: a short note of real history or folklore behind a plate.
 * Written only from attested sources; where a plate is the game's own
 * invention, the page says only what its order draws on and where its
 * epigraph comes from (see codexBlurb). Nothing here is made up history.
 */
import type { Card } from '../game/types';

/** What each order draws on (real traditions, kept general). */
export const ORDER_LORE: Record<string, string> = {
  'The Vril Syndicate':
    "'Vril' comes from Edward Bulwer-Lytton's novel The Coming Race (1871), where it is an all-powerful energy wielded by a race beneath the earth. The word caught on so well that the beef extract Bovril took its name from it.",
  'Order of the Lead Dawn':
    'In alchemy lead was the metal of Saturn, the slow and melancholy planet, and the base matter from which the Great Work began. The name echoes the Hermetic Order of the Golden Dawn, founded in London in 1888.',
  'Sons of the Green Lion':
    'The green lion is an alchemical emblem, often drawn devouring the sun: a raw, fierce solvent that could dissolve even gold. It appears in the Rosarium philosophorum, printed in 1550.',
  'The Hermetic Circle':
    'Hermeticism rests on writings credited to Hermes Trismegistus, "thrice-great Hermes". Marsilio Ficino translated the Corpus Hermeticum into Latin in 1463, and its ideas ran through Renaissance magic and alchemy.',
  'The Midnight Assembly':
    'The Assembly belongs to the age of American Prohibition (1920–1933), of speakeasies and the gangs that grew rich on bootleg liquor, crossed with the graveyard Gothic of Poe.',
  'The Columbia Lodge':
    'The Lodge draws on American occult history: the Spiritualism that began with the Fox sisters in 1848, Southern hoodoo and rootwork, and the tall tales and hauntings of the young republic.',
  'The Whitethorn Coven':
    'The Coven is the fairy faith of Ireland and the Scottish Highlands, as recorded by Robert Kirk in The Secret Commonwealth (1691) and by Yeats and Lady Gregory in the 1890s.',
  'The Helix Bureau':
    'The Bureau is the laboratory age: electricity, X-rays, the aether and the double helix, from Franklin and Faraday to the physics of the twentieth century.',
  'The Monad Faculty':
    "The Faculty takes its name from Leibniz's Monadology (1714), which held the world to be made of simple, windowless substances, and from the Pythagorean belief that number is the root of all things.",
  'The Iconostasy':
    'An iconostasis is the wall of icons that divides the nave from the sanctuary in an Orthodox church. The order draws on the Desert Fathers, Russian holy fools and elders, and the spirits of Slavic folk belief.',
  'The Briar Sidhe':
    'The aos sí, the people of the fairy mounds, were said to be the Tuatha Dé Danann, who withdrew into the hills when mortals came to Ireland. Thorn, rowan and running water mark their borders in the old tales.',
  'The Mercury Works':
    'The Works is the age of the coil, the radio valve and the patent office, between Faraday and the First World War, when machines seemed close to magic.',
  'The Closed Proof':
    'The Proof is a faculty of alchemists and mathematicians: Paracelsus and the Mutus Liber on one side, Archimedes, Fermat and Hilbert on the other.',
  'The Birch Vigil':
    'The Vigil keeps the spirits of East Slavic folk belief, the leshy of the woods, the domovoi of the stove, the rusalka of the river, and the wandering holy men of old Russia.',
  Unaligned: 'An unaligned plate belongs to no order.',
};

/** Plate-specific notes (2–3 sentences, from the attested record). */
export const CARD_LORE: Record<string, string> = {
  // ── The Whitethorn Coven ──
  fairy_doctor:
    "In nineteenth-century rural Ireland a 'fairy doctor' was a local healer, often an old woman, trusted to cure illness blamed on the fairies with herbs and charms. The most famous, Biddy Early of County Clare, died in 1872.",
  bean_nighe:
    'The bean-nighe, "washer woman", of Scottish Highland lore is seen at a lonely ford washing the grave-clothes of someone about to die. She was said to be the ghost of a woman who died in childbirth.',
  the_pooka:
    'The púca is a shape-shifting spirit of Irish folklore, most often a dark horse with burning eyes that takes riders on wild night journeys. Blackberries left on the bush after Samhain were said to be spoiled by it.',
  swan_maiden:
    "Swan maidens appear in folklore across Europe: women who lay aside swan skins to bathe and are bound to whoever steals one. In Irish legend the Children of Lir were turned into swans for nine hundred years.",
  clurichaun:
    'The clurichaun is a solitary Irish fairy, kin to the leprechaun, said to haunt wine cellars and drink himself merry. Thomas Crofton Croker described him in Fairy Legends and Traditions of the South of Ireland (1825).',
  the_fetch:
    "In Irish folklore a fetch is the exact double of a living person. Seen in the morning it promised long life; seen at evening it foretold death. Robert Kirk wrote of the same 'co-walker' in 1691.",
  brownie_of_the_stair:
    'The brownie of Scottish and northern English folklore is a household spirit that does the chores by night for a bowl of cream or porridge. A gift of clothes was said to drive him away for good.',
  selkie_coat:
    "In Orkney and Shetland tradition selkies are seals that shed their skins to come ashore in human shape. The tales tell of a man hiding a selkie's skin to keep her as his wife, until she finds it and returns to the sea.",
  fear_gortach:
    "Irish folklore tells of the féar gortach, 'hungry grass', a cursed patch of ground that strikes whoever crosses it with a sudden, deadly hunger. It was often said to grow where famine dead lay unburied.",
  the_merrow:
    'The merrow, Irish murúch, is a sea-woman who wears a red cap to pass beneath the waves; steal it and she cannot go home. Croker\'s "The Soul Cages" (1825) tells of a male merrow who kept drowned sailors\' souls in lobster pots.',
  the_sluagh:
    'The sluagh were the host of the restless dead in Highland and Irish belief, flying in flocks out of the west to carry off the souls of the dying. Alexander Carmichael recorded these beliefs in Carmina Gadelica (1900).',
  night_mare_of_the_barrow:
    "The 'mare' of Germanic and English folklore was a spirit that sat on a sleeper's chest and brought evil dreams, the root of the word nightmare. Henry Fuseli painted one crouched on a sleeping woman in The Nightmare (1781).",
  whitethorn_bind:
    'The lone hawthorn is the fairy tree of Ireland, left uncut in the middle of fields for fear of what the fairies would do. As recently as 1999 a road in County Clare was rerouted to spare one.',
  send_them_home:
    "Folklore said the fairies stole children and left changelings in their place, as in William Allingham's 'The Fairies' (1850). In 1895 Bridget Cleary of County Tipperary was killed by her husband, who claimed she was a changeling.",
  iron_in_the_milk:
    'Cold iron was the classic guard against fairies in Ireland and Britain: a horseshoe over the door, a knife or nail in the cradle or the churn.',
  the_good_peoples_cup:
    "People in Ireland and Scotland spoke of the fairies by flattering names, 'the Good People' or 'the Gentry', so as not to offend them. A drop of milk or the first of the drink was often left out for them.",
  the_may_queen:
    'May Eve and Bealtaine were thresholds when the fairies were most abroad; villages crowned a May Queen and decked May bushes against them. Tennyson\'s "The May Queen" was one of the best-loved poems of its century.',
  // ── The Helix Bureau ──
  aether_diver:
    'Nineteenth-century physicists believed light travelled through a luminiferous aether filling all space. The Michelson–Morley experiment of 1887 found no trace of it, and relativity made it unnecessary.',
  walking_dynamo:
    'At the Paris Exposition of 1900 the historian Henry Adams stood among the great dynamos and felt moved to pray to them. He wrote about it in "The Dynamo and the Virgin", a chapter of The Education of Henry Adams.',
  ozone_lieutenant:
    "Christian Friedrich Schönbein identified ozone in 1840 and named it from the Greek for 'to smell', after the sharp scent of electric sparks. Benjamin Franklin had drawn lightning down a kite string in 1752.",
  phosphor_clerk:
    "Hennig Brand of Hamburg discovered phosphorus in 1669 while boiling down urine in search of the philosopher's stone. The new substance glowed in the dark, and its name means 'light-bearer'.",
  gyro_priest:
    "William Gilbert's De Magnete (1600) argued that the Earth itself is a great magnet. Léon Foucault named the gyroscope in 1852, using it to show the Earth's rotation.",
  x_ray_confessor:
    "Wilhelm Röntgen discovered X-rays in November 1895; one of his first images showed the bones of his wife Anna Bertha's hand, wedding ring and all. He received the first Nobel Prize in Physics in 1901.",
  the_patent_golem:
    "The golem of Jewish folklore is a figure of clay brought to life; the Talmud tells that Rava created a man. The best-known legend ties a golem to Rabbi Judah Loew of Prague in the sixteenth century.",
  broadcast_spire:
    "Samuel Morse sent 'What hath God wrought' from Washington to Baltimore on 24 May 1844. In 1901 Guglielmo Marconi reported receiving a wireless signal across the Atlantic.",
  the_unlicensed_engine:
    "Matthew Boulton and James Watt built steam engines at Soho, Birmingham, under Watt's patent, which they defended fiercely in court until it ran out in 1800.",
  the_glass_lung:
    'Antoine Lavoisier showed that breathing is a slow burning that consumes oxygen, and named both oxygen and hydrogen. He was guillotined in Paris in 1794.',
  discharge:
    'The Leyden jar, invented in 1745–46, stored electric charge in a glass jar, and gave its experimenters painful shocks. Franklin, who joined many jars into a battery, once stunned himself while trying to kill a turkey with one.',
  melt_the_barrels:
    'President Eisenhower gave his "Chance for Peace" speech on 16 April 1953, weeks after Stalin\'s death, counting the cost of every gun and warship in schools and hospitals not built.',
  spare_helix:
    "James Watson and Francis Crick described the double helix of DNA in Nature on 25 April 1953. Rosalind Franklin's X-ray photograph of DNA, Photo 51, was key evidence.",
  // ── The Monad Faculty ──
  salt_magister:
    'The Emerald Tablet is a brief, cryptic text credited to Hermes Trismegistus and treasured by alchemists. Isaac Newton made his own English translation of it.',
  the_living_equation:
    "Leibniz's Monadology (1714) holds that the world is made of monads, simple substances without parts, each mirroring the whole universe from its own point of view.",
  projection_fellow:
    'Plotinus (c. 204–270) founded Neoplatonism, teaching that all things flow from the One and that the soul can return to it by turning inward. His pupil Porphyry gathered his writings as the Enneads.',
  athanor_keeper:
    "An athanor was the alchemist's furnace, built to hold a steady, gentle heat for days or weeks. The name comes through Arabic al-tannur, 'the oven'.",
  cipher_novice:
    "Euclid's Elements, written around 300 BC, was used as a geometry textbook for more than two thousand years. Proclus tells that Euclid told King Ptolemy there was no royal road to geometry.",
  the_golden_lemma:
    "The Pythagoreans held that number was the principle of all things, as Aristotle reports in the Metaphysics. They found that musical harmony follows simple ratios of whole numbers.",
  the_fixed_star:
    "The 'fixed stars' were the stars that keep their places against each other, unlike the wandering planets. Kant ended the Critique of Practical Reason (1788) with his awe at the starry heavens and the moral law.",
  abacus_saint:
    'On the night of 23 November 1654 Blaise Pascal had an overwhelming religious experience and wrote it down. He sewed the page into his coat, where it was found after his death.',
  the_remainder:
    "Ludwig Wittgenstein's Tractatus Logico-Philosophicus (1921) ends with the line 'Whereof one cannot speak, thereof one must be silent.' He wrote much of it as a soldier in the First World War.",
  the_non_euclidean:
    'In 1823 the young Hungarian János Bolyai wrote to his father that he had created a new universe: a geometry in which the parallel postulate fails. Nikolai Lobachevsky reached the same geometry independently.',
  solid_of_the_fifth:
    "Plato's Timaeus matches four regular solids to earth, air, fire and water. The fifth, the dodecahedron, the god used for the whole cosmos.",
  strike_the_term:
    "In the General Scholium added to the Principia in 1713, Newton wrote 'Hypotheses non fingo', I frame no hypotheses, refusing to guess at the cause of gravity.",
  two_lemmas:
    "Pascal wrote his Provincial Letters (1656–57) under a false name, mocking the Jesuits' moral reasoning. The pope had them condemned, and Louis XIV had them burned.",
  aqua_fortis:
    "Aqua fortis, 'strong water', was the alchemists' name for nitric acid. Assayers used it to part silver from gold, which it cannot dissolve.",
  rector_of_the_monad:
    "Leibniz wrote that monads 'have no windows', nothing can enter or leave them. Each unfolds its own nature in a harmony set in advance by God.",
  // ── The Iconostasy ──
  the_mad_hieromonk:
    'A hieromonk is an Orthodox monk who is also an ordained priest. The Sayings of the Desert Fathers gathers the words of the hermits of the Egyptian desert in the fourth and fifth centuries.',
  ovinnik:
    'The ovinnik is the spirit of the threshing barn in Russian folklore, often pictured as a huge black cat with burning eyes. Farmers left it offerings so it would not set the barn alight.',
  nochnitsa:
    "The nochnitsa, 'night one', is a hag of Slavic folklore who torments babies in their sleep. Mothers laid a knife or drew a circle round the cradle to keep her off.",
  gamayun:
    "Gamayun is a prophetic bird with a woman's head in Russian folklore, who knows all things. Viktor Vasnetsov painted her in 1897, and Alexander Blok wrote his poem about the painting.",
  likho:
    'Likho is bad luck in person in Slavic folklore, often a gaunt one-eyed hag. Once woken, it clings to its victim; hence the proverb not to wake Likho while it sleeps.',
  the_skomorokh:
    'The skomorokhi were wandering minstrels, jesters and bear-leaders of medieval Rus. The Church condemned their pagan merriment, and they were banned in 1648.',
  kupala_flame:
    'Kupala Night, at midsummer, is a Slavic festival of bonfires that young people leap over and wreaths floated on rivers. Legend held that the fern blossomed only on that night.',
  dvorovoi:
    "The dvorovoi is the yard spirit of Russian folklore, kin to the domovoi of the house. He was said to dislike animals with white fur.",
  the_black_monk:
    "In Anton Chekhov's story \"The Black Monk\" (1894), a brilliant scholar is visited by a phantom monk who tells him he is a genius. When he is cured of the vision, he loses his joy and his gift.",
  alkonost:
    "The alkonost is a bird with a woman's head from Russian legend, whose song makes those who hear it forget everything. Vasnetsov painted her with her sister the sirin in 1896.",
  the_pike_tsar:
    "In the Russian folktale of Emelya the Fool, a lazy youth spares a magic pike, which grants his every wish 'by the pike's command'. His stove even carries him to the tsar's palace.",
  the_grave_candle:
    "Welsh folklore tells of the canwyll corff, the corpse candle: a small light seen gliding toward the churchyard along the road a funeral will take. Its colour was said to foretell whose death was coming.",
  bark_knot:
    'The Jesus Prayer, "Lord Jesus Christ, Son of God, have mercy on me", is repeated without ceasing in Orthodox practice. The Way of a Pilgrim, a nineteenth-century Russian tale, follows a wanderer who learns it.',
  break_the_face:
    'During the Byzantine Iconoclasm of the eighth and ninth centuries, emperors had icons destroyed as idols. John of Damascus wrote their defence, arguing that he worshipped the Creator, not the matter.',
  coals_of_the_stove:
    "Theophan the Recluse (1815–1894) was a Russian bishop who gave up his see to live in seclusion and write on prayer. Much of his advice was gathered in The Art of Prayer.",
  father_of_the_last_icon:
    "'Beauty will save the world' is an idea attributed to Prince Myshkin in Dostoevsky's The Idiot (1869). The novel's 'holy fool' hero is a type long honoured in Russian piety.",
  // ── The Briar Sidhe ──
  cailleach_of_the_thorn:
    'The Cailleach is the divine hag of Irish and Scottish myth, a winter power said to have shaped mountains and to keep the deer. Yeats\'s "The Hosting of the Sidhe" (1899) calls up the fairy host riding from Knocknarea.',
  sidhe_knight:
    "In Irish myth the Tuatha Dé Danann withdrew into the sídhe, the hollow hills, when the Milesians took Ireland. Their descendants were the aos sí, the people of the mounds.",
  puck_of_the_gate:
    "Puck, or Robin Goodfellow, is a mischievous sprite of English folklore who misleads travellers and plays tricks in the dairy. Shakespeare made him Oberon's servant in A Midsummer Night's Dream.",
  leanan_of_the_well:
    "The leannán sí, 'fairy lover', takes a human lover and gives inspiration in return, but those she favours burn out young. Yeats called her the Gaelic muse.",
  kelpie_of_the_ford:
    'The kelpie is the water-horse of Scottish rivers, which lets travellers mount and then plunges into the water to drown them. Robert Burns warned of it in his "Address to the Deil" (1786).',
  the_dullahan:
    'The dullahan is a headless rider of Irish folklore who carries his own head under his arm. Where he stops, someone dies; he was said to be warded off only by gold.',
  changeling_cradle:
    "A changeling was a fairy left in a human child's cradle when the child was stolen. Yeats's \"The Stolen Child\" (1886) imagines the fairies luring a child away to the waters and the wild.",
  redcap:
    'Redcaps are murderous goblins of the Anglo-Scottish border, said to haunt ruined towers and dye their caps in the blood of travellers. William Henderson described them in 1866.',
  the_green_man:
    "The Green Man is a carved face made of, or sprouting, leaves, found in medieval churches across Europe. The name was given to these carvings by Lady Raglan in 1939.",
  banshee_of_the_barrow:
    "The banshee, bean sí, 'woman of the fairy mound', keens to foretell a death in certain old Irish families.",
  the_each_uisge:
    'The each-uisge is the Highland water-horse of sea lochs, said to be deadlier than the kelpie. It carried riders into the deep and devoured them, and only the liver washed ashore.',
  will_of_the_marsh:
    "The will-o'-the-wisp, ignis fatuus or 'foolish fire', is a faint light over marshes that was said to lead travellers astray. It is now usually put down to marsh gas igniting.",
  hawthorn_lock:
    'Thomas of Erceldoune, a thirteenth-century Scottish laird, was said to have been carried off to Elfland by its queen and returned with the gift of prophecy. The ballad of Thomas the Rhymer tells the tale.',
  milk_and_iron:
    'Kipling\'s poem "Cold Iron" appeared in Rewards and Fairies (1910). Old belief held that fairies could not abide iron.',
  rowan_nail:
    'In Scotland and Ireland the rowan, or mountain ash, was a charm against witches and fairies, tied with red thread over doors and byres. The Scottish rhyme says rowan and red thread put the witches to their speed.',
  the_whitethorn_queen:
    'In the ballad of Thomas the Rhymer (Child Ballad 37) the Queen of Elfland meets Thomas under the Eildon tree and takes him away for seven years.',
  // ── The Mercury Works ──
  coil_saint:
    'Michael Faraday discovered electromagnetic induction in 1831, the principle behind every dynamo and transformer. A blacksmith\'s son with little schooling, he became the greatest experimenter of his age.',
  gas_mask_chemist:
    'Chlorine gas was first used on a large scale at Ypres on 22 April 1915. Wilfred Owen, who wrote "Dulce et Decorum Est", was killed one week before the Armistice in 1918.',
  cathode_acolyte:
    'William Crookes built the vacuum tubes in which he studied the glowing "radiant matter" now known as cathode rays. He also investigated spiritualist mediums, including Florence Cook.',
  ray_rifleman:
    "H. G. Wells gave his Martians a heat-ray in The War of the Worlds (1898). In the 1920s and 1930s several inventors, Harry Grindell Matthews among them, claimed to have built real death rays.",
  brass_automaton:
    "Julien Offray de La Mettrie argued in Man a Machine (1747) that the body is a self-winding mechanism. Jacques de Vaucanson's mechanical duck of 1739 appeared to eat and digest.",
  the_patent_airship:
    "Count Ferdinand von Zeppelin's first rigid airship flew over Lake Constance in July 1900. Tennyson's \"Locksley Hall\" (1842) had foreseen the heavens filled with commerce.",
  galvanic_hound:
    "In the 1780s Luigi Galvani made dead frogs' legs kick with electricity and believed he had found 'animal electricity'. In 1803 his nephew Giovanni Aldini made the corpse of a hanged man twitch before an audience in London.",
  difference_engine:
    "Charles Babbage designed his Difference Engine in the 1820s to calculate mathematical tables by machine. Ada Lovelace's 1843 notes on his Analytical Engine contain what is often called the first computer program.",
  radium_sister:
    'Marie and Pierre Curie announced the discovery of radium in 1898. In the 1920s the American "Radium Girls" who painted luminous watch dials, licking their brushes to a point, fell gravely ill.',
  trench_radio:
    "Alexander Graham Bell made the first telephone call on 10 March 1876. By the First World War, field telephones and wireless sets carried orders along the trenches.",
  null_tank:
    'Tanks first went into battle at Flers–Courcelette on the Somme on 15 September 1916. They were called "tanks" at first to keep their purpose secret.',
  overload:
    "In 1933 Ernest Rutherford called the idea of drawing power from the atom 'moonshine'. Leó Szilárd, annoyed by the remark, conceived the nuclear chain reaction soon after.",
  blackout_patent:
    "On the eve of war in August 1914, Britain's Foreign Secretary Sir Edward Grey is said to have remarked that the lamps were going out all over Europe. He recorded the words in his memoir Twenty-Five Years (1925).",
  scrap_the_line:
    "Lucretius' poem On the Nature of Things, of the first century BC, sets out the Epicurean teaching that everything is made of atoms moving in the void. A copy rediscovered in 1417 helped shape the Renaissance.",
  spare_cathode:
    'Thales of Miletus, of the sixth century BC, is remembered as the first Greek philosopher. Aristotle reports that he thought the lodestone had a soul, because it moves iron.',
  director_voss:
    "Mary Shelley's Frankenstein (1818) was begun at the Villa Diodati in 1816 during a ghost-story contest with Byron. Its subtitle is The Modern Prometheus.",
  // ── The Closed Proof ──
  geometer_of_the_circle:
    "Archimedes was killed when the Romans took Syracuse in 212 BC. The story goes that he was drawing figures in the sand and told the soldier not to disturb his circles.",
  quicksilver_fellow:
    "Quicksilver, the metal mercury, was one of the alchemists' principles of all metals. Zeno of Elea's paradox claims that swift Achilles can never overtake a tortoise with a head start.",
  homunculus_clerk:
    "A text credited to Paracelsus, De Natura Rerum (1537), gives a recipe for growing a homunculus, a tiny artificial man, in a sealed flask.",
  vitriol_reader:
    "'Oil of vitriol' was the old name for sulphuric acid, made from the glassy crystals the alchemists called vitriols. Francis Bacon's essay Of Studies weighs which books deserve tasting and which digesting.",
  the_walking_thesis:
    "In 1930 David Hilbert ended a radio address in Königsberg with 'We must know. We will know.' The words are on his gravestone, though Kurt Gödel's incompleteness theorems, announced in the same city the day before, showed that some truths can never be proved.",
  azoth_lecturer:
    "Éliphas Lévi, born Alphonse Louis Constant, was the most influential French occultist of the nineteenth century; his Dogme et Rituel de la Haute Magie appeared in 1854–56. Azoth was the alchemists' name for a universal medicine or for mercury.",
  cabalist_of_number:
    "John Dee wrote the Mathematical Preface to the first English Euclid in 1570. Mathematician and adviser to Elizabeth I, he also spent years trying to speak with angels through the scryer Edward Kelley.",
  retort_warden:
    'The Mutus Liber, the "Silent Book", printed at La Rochelle in 1677, tells the whole alchemical work in fifteen plates with almost no words. A retort is the long-necked flask in which matter was distilled.',
  sealed_formula:
    "Around 1637 Pierre de Fermat wrote in a margin that he had a marvellous proof which the margin was too small to hold. Fermat's Last Theorem was finally proved by Andrew Wiles in 1994.",
  azoth_swordsman:
    "Paracelsus was often portrayed with a long sword, and legend said its pommel held his 'Azoth', a secret medicine. His motto, 'let no man belong to another who can belong to himself', appears on his 1538 portrait.",
  cancel_the_term:
    "The Tao Te Ching, credited to Laozi, opens by saying that the Tao which can be named is not the eternal Tao. Its short chapters became a founding text of Taoism.",
  the_short_proof:
    "Vitruvius tells how Archimedes, stepping into a bath, saw how to test whether King Hiero's crown was pure gold, and ran home crying 'Eureka!'",
  vitriol:
    'Vitriol was the alchemists\' name for the sulphates and the acid made from them. The motto V.I.T.R.I.O.L., "visit the interior of the earth, and by rectifying you will find the hidden stone", was read as an acrostic of the Great Work.',
  // ── The Birch Vigil ──
  volkhv_of_the_birches:
    "The volkhvy were the pagan priest-sorcerers of early Rus. The Primary Chronicle tells how one foretold that Prince Oleg would die by his horse, the tale Pushkin retold in 1822.",
  leshy:
    "The leshy is the lord of the forest in Slavic folklore, able to grow tall as the trees or small as a leaf, and to lead travellers in circles. Turning your clothes inside out was said to break his spell.",
  rusalka:
    'Rusalki are water spirits of Slavic folklore, often the restless ghosts of young women who drowned. They were thought most dangerous in Rusalka Week, at the start of summer.',
  domovoi:
    'The domovoi is the household spirit of Russian folklore, living behind or under the stove. When a family moved house, they carried embers from the old hearth to bring him with them.',
  bannik:
    "The bannik is the spirit of the Slavic bathhouse, the banya, who could scald or strangle those who bathed at the wrong hour. The Primary Chronicle has the apostle Andrew marvelling at the Novgorodians' steam baths.",
  firebird:
    "The Firebird of Russian folktales has feathers that glow like fire, and a single feather can light a room. Stravinsky's ballet The Firebird was first danced in Paris in 1910.",
  bogatyr_monk:
    'Bogatyrs are the warrior heroes of the Russian epic songs, the byliny. Archpriest Avvakum, who led the Old Believers against the reforms of Patriarch Nikon, was burned at the stake in 1682.',
  kikimora:
    'The kikimora is a female house spirit of Slavic folklore who spins at night and torments the household if it is badly kept. Anatoly Lyadov wrote a tone poem about her in 1909.',
  polevik:
    "The polevik is a field spirit of East Slavic folklore. With the poludnitsa, the 'noon lady', he was blamed for harm that came to workers in the fields at midday.",
  vodyanoy:
    'The vodyanoy is the water spirit of Slavic folklore, an old man with a frog-like face and a green beard who drowns those who bathe after dark. Millers made offerings to him to protect their dams.',
  upir_of_the_chapel:
    'Upir is the old East Slavic word for a vampire. In Gogol\'s story "Viy" (1835) a seminarian must read the psalter for three nights over a dead witch in a chapel, until the monstrous Viy is summoned.',
  the_birch_knot:
    'The birch is at the heart of Slavic spring rites, when girls wove and curled its branches. The folk song "In the field a birch tree stood" appears in the finale of Tchaikovsky\'s Fourth Symphony.',
  stove_of_the_hut:
    "Baba Yaga's hut stands on chicken legs, and the hero bids it turn its back to the forest and its front to him. Alexander Afanasyev published his great collection of Russian folktales from 1855.",
  the_mad_starets:
    'A starets is an elder of Orthodox monasticism, sought out for spiritual counsel. Grigori Rasputin was popularly called one, though he never held any such office.',
  // ── The Vril Syndicate ──
  trench_revenants:
    'Laurence Binyon wrote "For the Fallen" in September 1914, in the first weeks of the war. Its fourth stanza is still read at Remembrance services.',
  hex_banner:
    "Before the Battle of the Milvian Bridge in 312, Constantine is said to have seen a sign in the sky with the words 'in this sign you will conquer'. He won, and became the first Christian emperor.",
  initiate_of_the_coil:
    "'As above, so below' is the usual short form of a line from the Emerald Tablet, the founding text of Hermetic alchemy.",
  night_zeppelin:
    'German Zeppelins first bombed Britain in January 1915, crossing the North Sea at night. Searchlights and incendiary bullets eventually made the raids costly.',
  champion_of_the_inner_earth:
    'In 1818 John Cleves Symmes Jr. announced that the Earth was hollow, with openings at the poles. Bulwer-Lytton set his Vril-wielding race in caverns beneath the earth.',
  chlorine_psalm:
    "'Now I am become Death, the destroyer of worlds' is J. Robert Oppenheimer's rendering of a line from the Bhagavad Gita, which he said came to him at the Trinity test of July 1945.",
  foo_fighter:
    "'Foo fighters' was the name Allied airmen gave to strange glowing lights that seemed to pace their aircraft over Europe and the Pacific in 1944–45. No explanation was ever settled.",
  vril_wyrm:
    "G. K. Chesterton's essay in Tremendous Trifles (1909) defends fairy tales: children already know the dragon, the tale gives them the St. George to kill it.",
  // ── Order of the Lead Dawn ──
  saturn_medium:
    'In alchemy and astrology lead was the metal of Saturn, the slowest of the planets known to the ancients, ruler of melancholy and of old age.',
  strix_widow:
    "The strix of Roman legend was a night bird of ill omen that fed on human flesh and blood. Its name survives in the Italian strega, 'witch'.",
  unblinking_penitent:
    'In Poe\'s "The Cask of Amontillado" (1846), Montresor walls his enemy up alive in the catacombs during carnival. The last words of the victim are the plea on this plate.',
  hoarfrost_saint:
    'Samuel Taylor Coleridge wrote "Frost at Midnight" in 1798 while sitting up beside his sleeping infant son.',
  black_shuck:
    'Black Shuck is the ghostly black dog of East Anglian folklore. In August 1577 a black dog was said to have burst into the churches at Bungay and Blythburgh in a storm, killing worshippers.',
  lead_toad:
    'Old belief held that a toad carried a precious jewel, the toadstone, in its head, an antidote to poison. Shakespeare alludes to it in As You Like It.',
  parish_tithe_lord:
    'The tithe was a tenth of the produce of the land, owed to the parish church. In England the last of it was extinguished by the Tithe Act of 1936.',
  // ── Sons of the Green Lion ──
  peat_brute:
    "Peat bogs preserve bodies for thousands of years; the Tollund Man, found in Denmark in 1950, still bore the noose he died with. Seamus Heaney wrote a sequence of 'bog poems' about such finds.",
  opened_barrow:
    'A barrow is an ancient burial mound. The Harper\'s Song from the tomb of King Intef, of ancient Egypt, doubts the afterlife and urges the living to enjoy their days.',
  green_man:
    "Jack-in-the-Green was a figure of English May Day processions: a man, often a chimney sweep, inside a tall frame covered in leaves. The custom flourished in the eighteenth and nineteenth centuries.",
  afanc:
    'The afanc is a monster of Welsh lakes, blamed for floods. One tale says it was lured out of the water and dragged away by a team of oxen.',
  queen_of_the_hedgerow:
    'Elizabeth I spoke to her troops at Tilbury in August 1588, as the Spanish Armada threatened invasion, saying she had the heart and stomach of a king.',
  // ── The Hermetic Circle ──
  duke_of_the_crucible:
    "The Emerald Tablet bids the adept to separate the earth from the fire, the subtle from the gross, gently and with great skill. A crucible is the vessel in which metals are melted.",
  glass_homunculus:
    'Paracelsus taught that man is a microcosm, a small world mirroring the great one. A text credited to him tells how a homunculus might be grown in a flask.',
  athanor_adept:
    "'Solve et coagula', dissolve and coagulate, is the alchemical maxim of breaking matter down and binding it anew. It is written on the arms of Eliphas Lévi's Baphomet.",
  third_eye_disciple:
    'Meister Eckhart, the fourteenth-century German Dominican mystic, taught that the eye with which he saw God was the eye with which God saw him. Some of his teachings were condemned as heretical in 1329.',
  azoth_twin:
    "In Plato's Symposium Aristophanes tells that humans were once double creatures, cut in two by Zeus; love is each half seeking the other.",
  back_alley_vitriol:
    'V.I.T.R.I.O.L. stands for "Visita interiora terrae rectificando invenies occultum lapidem": visit the interior of the earth, and by rectifying you will find the hidden stone.',
  quicksilver_valet:
    "Paracelsus added salt to the alchemists' sulphur and mercury, making the tria prima: mercury as spirit, sulphur as soul, salt as body.",
  lead_golem:
    "The word golem appears once in the Hebrew Bible, in Psalm 139:16, for the unformed substance of a body. Later folklore used it for a figure of clay brought to life.",
  trepan_rite:
    'Trepanation, boring a hole in the living skull, is one of the oldest known surgeries; healed holes are found in skulls from the Stone Age.',
  the_thirteenth_chair:
    'The Thirteenth Chair, a 1916 stage thriller by Bayard Veiller, turns on a murder committed in the dark during a séance. It was filmed in 1919 and 1929.',
  rose_of_the_shut_garden:
    'The hortus conclusus, the "garden enclosed" of the Song of Songs, became a medieval symbol of the Virgin and of the soul kept pure. Rose gardens behind walls were its painted image.',
  spring_heeled_jack:
    'Spring-heeled Jack was a leaping figure reported around London from 1837, said to have clawed hands and to breathe blue flame. In 1838 Jane Alsop told magistrates he had attacked her at her door.',
  mirror_hag:
    "In the Grimms' \"Little Snow-White\" the queen asks her mirror who is fairest of all. Mirrors were long covered in houses of the dead, lest the soul be caught in them.",
  the_gold_fraud:
    "Alchemists who promised gold to princes risked their necks. Edward Kelley, who claimed to have transmuted metal before Emperor Rudolf II, died a prisoner in Bohemia around 1597.",
  // ── The Midnight Assembly ──
  velvet_revenant:
    'Poe\'s "The Premature Burial" (1844) fed a real nineteenth-century terror of being buried alive; "safety coffins" with bells and air pipes were patented.',
  speakeasy_shade:
    'Speakeasies were the illegal bars of American Prohibition, so called because patrons were told to speak softly about them. New York alone was said to have tens of thousands.',
  alley_medium:
    "In Dickens's A Christmas Carol (1843) the ghost of Jacob Marley wears the chain he forged in life, of cash-boxes, keys and ledgers.",
  last_call:
    'In Poe\'s "The Masque of the Red Death" (1842), Prince Prospero walls himself and his courtiers in an abbey to escape a plague, which comes to the masquerade all the same.',
  pale_passenger:
    'The vanishing hitchhiker, a passenger who disappears from a moving car and turns out to have died years before, is one of the most widespread urban legends. The folklorist Jan Harold Brunvand made it the title of his 1981 study.',
  // ── The Columbia Lodge ──
  hydesville_rapper:
    "In March 1848 the young sisters Kate and Margaret Fox of Hydesville, New York, claimed to talk with a spirit by raps, calling it Mr. Splitfoot. Spiritualism grew from them; in 1888 Margaret confessed they had cracked their toe joints.",
  franklin_s_key:
    'Benjamin Franklin\'s kite experiment of 1752 drew a spark from a key tied to a kite string in a thunderstorm, showing that lightning is electricity. He went on to invent the lightning rod.',
  high_john:
    "High John the Conqueror is a trickster hero of African American folklore, who outwits the master and keeps hope alive. His name is also given to a root carried in hoodoo for luck and strength; Zora Neale Hurston wrote of him in 1943.",
  appleseed_walker:
    'John Chapman, "Johnny Appleseed" (1774–1845), planted apple nurseries across Pennsylvania, Ohio and Indiana ahead of the settlers. He was also a missionary for the teachings of Emanuel Swedenborg.',
  coyote_s_laugh:
    "Coyote is the trickster of many Native American traditions, clever, greedy and often undone by his own schemes. Mark Twain described the animal in Roughing It (1872).",
  menlo_spirit_wright:
    'Thomas Edison built his laboratory at Menlo Park, New Jersey, in 1876. In 1920 he told interviewers he was working on a machine to talk with the dead. Twain\'s "A Ghost Story" mocks the Cardiff Giant hoax of 1869.',
  lily_dale_voice:
    'Lily Dale, in western New York, was founded by Spiritualists in 1879 and still hosts mediums every summer.',
  randolph_glass:
    'Paschal Beverly Randolph (1825–1875) was an American physician, occultist and abolitionist who taught the use of magic mirrors for scrying. He is said to have founded the Fraternitas Rosae Crucis in 1858.',
  powwow_doctor:
    "Powwow, or Braucherei, is the folk healing of the Pennsylvania Dutch, using charms, prayers and blessings. John George Hohman's charm book The Long Lost Friend was printed in 1820.",
  wardenclyffe_adept:
    "Nikola Tesla built Wardenclyffe Tower on Long Island in 1901–02 to send messages, and he hoped power, without wires. The money ran out, and the tower was demolished in 1917.",
  rocket_chemist:
    "Robert Goddard launched the world's first liquid-fuelled rocket at Auburn, Massachusetts, on 16 March 1926. It flew for about two and a half seconds.",
  poughkeepsie_seer:
    'Andrew Jackson Davis (1826–1910), "the Poughkeepsie Seer", dictated books in trance from 1845, and his visions of a spirit world helped prepare the ground for Spiritualism.',
  the_bell_witch:
    "The Bell Witch legend of Adams, Tennessee, tells of a spirit that tormented John Bell's family from about 1817, and was blamed for his death in 1820.",
  sleepy_hollow_rider:
    "Washington Irving's \"The Legend of Sleepy Hollow\" (1820) tells of the schoolmaster Ichabod Crane and the Headless Horseman, said to be a Hessian trooper whose head was carried off by a cannonball.",
  leeds_devil:
    'The Jersey Devil, once called the Leeds Devil, is said to be the thirteenth child of a "Mother Leeds", born in the Pine Barrens of New Jersey. In January 1909 hundreds of people reported seeing it or its tracks.',
  thunderbird:
    'The Thunderbird is a mighty spirit in many Indigenous cultures of North America, whose wingbeats make the thunder and whose eyes flash lightning.',
  john_henry:
    'John Henry is the steel-driving man of the African American ballad, who raced a steam drill through a mountain, won, and died with his hammer in his hand. The legend is often tied to railroad tunnels of the 1870s.',
  goofer_dust:
    'Goofer dust is a powder of hoodoo, often made with graveyard dirt, laid down to curse an enemy. The word is usually traced to a Kongo word meaning "to die".',
  hot_foot_powder:
    'Hot-foot powder is a hoodoo preparation sprinkled where an unwanted person will walk, to drive them away. Robert Johnson sang of it in "Hellhound on My Trail" (1937).',
  liberty_lightning:
    "Franklin's line about trading liberty for safety was written in 1755 for the Pennsylvania Assembly, in a dispute over taxes for frontier defence.",
  the_hydesville_knock:
    'The raps heard in the Fox family cottage at Hydesville, New York, in 1848 are counted as the birth of modern Spiritualism. Within a few years séances were held across America and Europe.',
  spirit_phone:
    "In 1920 Thomas Edison told interviewers he hoped to build an apparatus sensitive enough to record messages from the dead. No such device was ever found among his papers.",
  mojo_hand:
    "A mojo, or mojo hand, is a small cloth charm bag of hoodoo, filled with roots, herbs and curios. Muddy Waters made 'Got My Mojo Working' famous in the late 1950s.",
  edgar_cayce:
    'Edgar Cayce (1877–1945), "the Sleeping Prophet", gave thousands of trance readings on health and past lives, many of them from Virginia Beach. His readings are kept by the association he founded.',
  edgar_allan_poe:
    'Edgar Allan Poe (1809–1849) shaped the Gothic tale, the detective story and the modern short story. "The Raven" made him famous when it was published in January 1845.',
  mothman:
    'Mothman was reported around Point Pleasant, West Virginia, in 1966 and 1967: a winged figure with glowing red eyes. The sightings ended about the time the Silver Bridge collapsed in December 1967.',
  sasquatch:
    "The name Sasquatch comes from a Halkomelem word and was spread in the 1920s by the teacher J. W. Burns of British Columbia. The Patterson–Gimlin film of 1967 is the most famous claimed footage.",
  // ── Unaligned ──
  nuclear_winter:
    'The theory of nuclear winter, that smoke from burning cities could darken the sun and chill the earth for years, was set out in 1983 by Turco, Toon, Ackerman, Pollack and Sagan.',
  radiation_poisoning:
    'Acute radiation sickness was first studied in the survivors of Hiroshima and Nagasaki in 1945. Its symptoms come in waves, and a quiet spell can hide how badly the body has been hurt.',
  black_monday:
    "On Black Monday, 28 October 1929, the Dow Jones fell about thirteen per cent, and the crash went on the next day. John Kenneth Galbraith told the story in The Great Crash, 1929 (1955).",
};

/** The Codex page text for a plate: its own note, or its order's tradition. */
export function codexBlurb(card: Card): string {
  const own = CARD_LORE[card.id];
  if (own) return own;
  const order = ORDER_LORE[card.faction] ?? '';
  const src = card.quoted ? ` The words on the plate are from ${card.quoted}.` : '';
  return `${order}${src}`.trim();
}

export function eraOf(faction: string): 'first' | 'second' | 'old' | 'none' {
  if (
    ['The Whitethorn Coven', 'The Helix Bureau', 'The Monad Faculty', 'The Iconostasy'].includes(faction)
  )
    return 'second';
  if (['The Briar Sidhe', 'The Mercury Works', 'The Closed Proof', 'The Birch Vigil'].includes(faction)) return 'old';
  if (faction === 'Unaligned') return 'none';
  return 'first';
}
