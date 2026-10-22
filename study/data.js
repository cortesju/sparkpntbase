// The RTK course. Nine chapters in the order you would actually learn this:
// what accuracy means, how RTK works, how corrections reach the receiver, which
// source to choose, standing up a base, post-processing, the product line,
// recommending kit, and supporting customers.
//
// Each chapter holds:
//   lessons - short study areas: read the body, take the key points, follow the
//             links for depth, and answer the quick check before moving on
//   exam    - the end-of-chapter test. "mc" is multiple choice (answer is the index
//             of the right option), "text" is typed and graded on the keywords in
//             `accept`, with the model answer shown either way.
//
// Content comes from the Week-1 study docs (00-06) and the support case notes.
// Anything still unconfirmed is marked as such in the text rather than smoothed over.

const COURSE = [

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "foundations",
  title: "Before anything else",
  goal: "Know what GNSS is, how a receiver works out where it is, and every word the rest of the course uses.",
  minutes: 20,
  lessons: [
    {
      id: "what-is-gnss",
      title: "What GNSS is, and who runs it",
      body: [
        "GNSS stands for Global Navigation Satellite System. It is the umbrella term for every constellation of navigation satellites, and there are four global ones: GPS, run by the United States; Galileo, run by the European Union; GLONASS, run by Russia; and BeiDou, run by China. There are regional systems too, such as Japan's QZSS and India's NavIC.",
        "GPS is one of the four, not the category. People say GPS the way they say Hoover for a vacuum cleaner, and it is worth being precise about it, because a modern receiver uses all four at once. More constellations means more satellites in view, which means a position that holds up under trees and beside buildings where any single system would struggle.",
        "Every one of these satellites is doing the same simple thing: broadcasting, continuously, a signal that says who it is and precisely what time it is."
      ],
      keys: [
        "GNSS = Global Navigation Satellite System, the category.",
        "Four global constellations: GPS (US), Galileo (EU), GLONASS (Russia), BeiDou (China).",
        "GPS is one of them, not the name for all of them.",
        "Using all four at once is what keeps a position alive in difficult places."
      ],
      links: [
        { label: "GPS.gov, the official US system reference", url: "https://www.gps.gov/", kind: "read" },
        { label: "Galileo service centre", url: "https://www.gsc-europa.eu/galileo/services/galileo-high-accuracy-service-has", kind: "read" },
        { label: "ESA Navipedia, the encyclopedia for all of this", url: "https://gssc.esa.int/navipedia/index.php/Main_Page", kind: "doc" }
      ],
      check: { q: "Name the four global constellations.", a: "GPS, Galileo, GLONASS and BeiDou. QZSS and NavIC are regional additions." }
    },
    {
      id: "how-position",
      title: "How a receiver works out where it is",
      body: [
        "Each satellite broadcasts the time, taken from an atomic clock on board, along with its own orbit information. The signal travels at the speed of light, so if a receiver knows when the signal left and when it arrived, the difference in those two times multiplied by the speed of light is the distance to that satellite.",
        "One distance puts you somewhere on a sphere around that satellite. Two distances put you on the circle where two spheres intersect. Three narrow it to a couple of points, one of which is absurd and gets discarded. This is trilateration, and it is the whole idea.",
        "In practice a receiver needs a fourth satellite. Its own clock is a cheap quartz oscillator rather than an atomic standard, so it does not know the exact time either. The fourth measurement lets it solve for its own clock error alongside the three position coordinates. That is why four satellites is the minimum and why more is always better.",
        "Now the term you will meet everywhere. That distance a receiver measures to each satellite has a name: a pseudorange. The prefix is an admission. It is not the true range, because the number still carries the receiver's own clock error and every atmospheric delay the signal picked up on the way down. The receiver reports it anyway, because it is the raw material everything else works on.",
        "That is worth holding on to, because it reframes the rest of this course. Corrections do not improve the satellites and they do not improve the antenna. They exist to strip the errors out of pseudoranges, so that a pseudorange becomes something close to a real range. Chapter 2 counts up exactly which errors those are, and chapter 3 is about where the information to remove them comes from."
      ],
      keys: [
        "Distance to a satellite = travel time multiplied by the speed of light.",
        "Three distances fix a position; a fourth solves the receiver's own clock error.",
        "Pseudorange: the measured distance to a satellite, still carrying the receiver clock error and the atmospheric delays. Not yet a true range, which is what the 'pseudo' admits.",
        "Every correction technique in this course exists to turn pseudoranges into something closer to true ranges.",
        "More satellites means a better solution, which is why multi-constellation matters."
      ],
      links: [
        { label: "What is GPS RTK? (SparkFun)", url: "https://learn.sparkfun.com/tutorials/what-is-gps-rtk", kind: "read" },
        { label: "SparkFun on YouTube, for walkthroughs", url: "https://www.youtube.com/@sparkfun", kind: "video" }
      ],
      checks: [
        { q: "Why does a receiver need four satellites rather than three?", a: "Three give the three position coordinates. The fourth solves for the receiver's own clock error, because its quartz clock is not accurate enough to trust." },
        { q: "What is a pseudorange, and what is the 'pseudo' admitting?", a: "The distance a receiver measures to a satellite from signal travel time. The prefix admits it is not the true range, because it still contains the receiver's clock error and the atmospheric delays." }
      ]
    },
    {
      id: "bands",
      title: "Bands, and why a receiver wants several",
      body: [
        "Satellites do not broadcast on one frequency. GPS uses L1, L2 and L5; Galileo uses E1, E5 and E6. A receiver that listens on only one of them is called single-band, and one that listens on several is multi-band or, when it covers four, quad-band.",
        "The reason this matters is the ionosphere. The delay it adds depends on the frequency of the signal passing through it, which sounds like a nuisance and is in fact a gift: measure the same satellite on two frequencies and compare the two answers, and you can calculate the ionospheric delay and remove most of it. A single-band receiver has to guess it from a model.",
        "Multi-band also means more measurements per satellite, which makes the hardest step in RTK, covered in chapter 2, both faster and more reliable. When you see quad-band L1/L2/L5/E6 on a specification sheet, that is what is being claimed.",
        "E6 gets its own mention because Galileo broadcasts a free correction service on it. That comes back in chapter 3."
      ],
      keys: [
        "Single-band listens on one frequency, multi-band on several.",
        "Ionospheric delay depends on frequency, so two frequencies let a receiver measure and remove most of it.",
        "More bands also means faster and more reliable RTK.",
        "Galileo's E6 carries a free correction service, which is why it appears on specification sheets."
      ],
      links: [],
      check: { q: "Why is a dual-band receiver better than a single-band one in one sentence?", a: "Because comparing the same satellite on two frequencies lets it measure the ionospheric delay directly rather than guessing it from a model." }
    },
    {
      id: "vocabulary",
      title: "The words the rest of the course uses",
      body: [
        "A rover is the receiver you carry, on a pole or a vehicle or a drone, whose position you actually want. A base is a second receiver that stays still on one spot and helps the rover do better. Those two words are used constantly from here on.",
        "A correction is information that helps a receiver remove errors it cannot see on its own, whether that arrives by internet, by radio, or from a satellite. A correction source is wherever that information comes from.",
        "Two acronyms appear immediately and are worth knowing now. RTK is Real-Time Kinematic, the technique this course is mostly about, which uses a base to get a rover to centimeter accuracy live in the field. RTCM is the Radio Technical Commission for Maritime Services, whose message standard is the format corrections are usually sent in. When someone says 'it needs RTCM 3', they mean the version of that format.",
        "Everything else is introduced where it is used, and there is a glossary linked from the course page if a term escapes you."
      ],
      keys: [
        "Rover: the receiver whose position you want.",
        "Base: a stationary second receiver that helps the rover.",
        "RTK: Real-Time Kinematic, centimeter accuracy live in the field.",
        "RTCM: the standard message format corrections travel in."
      ],
      links: [
        { label: "SparkPNT documentation", url: "https://docs.sparkpnt.com", kind: "doc" }
      ],
      check: { q: "What do RTK and RTCM stand for?", a: "Real-Time Kinematic, and the Radio Technical Commission for Maritime Services, whose format corrections are sent in." }
    }
  ],
  exam: [
    { type: "mc", q: "Which statement about GNSS is correct?",
      options: ["GPS is simply another word for GNSS", "GNSS covers GPS, Galileo, GLONASS and BeiDou", "GNSS refers to the European system only", "GNSS means the ground stations, not the satellites"],
      answer: 1,
      why: "GNSS is the umbrella term. GPS is the American constellation, and a modern receiver uses all four global systems together." },
    { type: "mc", q: "A receiver has locked onto exactly three satellites. What is missing?",
      options: ["Nothing, three satellites is a complete solution", "A fourth, to solve the receiver's own clock error", "A fourth, to measure the ionospheric delay", "All of the above"],
      answer: 1,
      why: "Three measurements give three coordinates. The receiver's quartz clock is a fourth unknown, so it takes a fourth satellite to solve." },
    { type: "mc", q: "Why does a dual-band receiver handle the ionosphere better than a single-band one?",
      options: ["It has a larger antenna, so it collects more signal energy", "Ionospheric delay varies with frequency, so two frequencies reveal it", "It sees more satellites, which improves the geometry", "It updates its position faster, so the errors average out"],
      answer: 1,
      why: "The delay is frequency-dependent, so comparing the same satellite on two frequencies lets the receiver calculate the delay instead of modelling it." },
    { type: "text", q: "What is a pseudorange, and why the 'pseudo'?",
      accept: ["distance", "clock", "range"],
      answer: "It is the measured distance to a satellite, from travel time multiplied by the speed of light. It is 'pseudo' because it still contains the receiver's clock error and the atmospheric delays, so it is not yet a true range." },
    { type: "text", q: "Define base and rover.",
      accept: ["base", "rover"],
      answer: "The rover is the receiver you carry, whose position you want. The base is a second receiver that stays still on one spot and provides the corrections that let the rover do better." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "accuracy",
  title: "What accuracy actually means",
  goal: "Answer 'how accurate is it?' in three numbers, and know why precision and accuracy are not the same thing.",
  minutes: 20,
  lessons: [
    {
      id: "why-meter",
      title: "Why a plain receiver only gets within a meter",
      body: [
        "A GNSS signal leaves a satellite roughly 20,000 km up and arrives with several kinds of damage. The ionosphere and troposphere slow it down by an amount that changes hour to hour. The satellite's own clock drifts. The broadcast orbit is a prediction, not a measurement. And close to the ground the signal bounces off buildings, vehicles and wet foliage before it reaches the antenna.",
        "A receiver working alone has no way to separate those errors from your actual position, so it lands somewhere within a meter or a few meters. That is genuinely fine for navigation. It is useless for staking a property corner, and that gap is the entire reason RTK exists."
      ],
      keys: [
        "Five error sources: ionosphere, troposphere, satellite clock drift, orbit error, multipath.",
        "Standalone GNSS is a meter-class answer, not a centimeter-class one.",
        "SBAS, satellite-based augmentation (WAAS in North America), is free and built in, and gets you to roughly a meter. That is the floor before any correction source."
      ],
      links: [
        { label: "What is GPS RTK? (SparkFun tutorial)", url: "https://learn.sparkfun.com/tutorials/what-is-gps-rtk", kind: "read" },
        { label: "GPS.gov, the official system reference", url: "https://www.gps.gov/", kind: "read" },
        { label: "ESA Navipedia, deeper on error sources", url: "https://gssc.esa.int/navipedia/index.php/Main_Page", kind: "doc" }
      ],
      check: { q: "Name three of the five error sources.", a: "Any three of: ionospheric delay, tropospheric delay, satellite clock drift, orbit error, multipath." }
    },
    {
      id: "ladder",
      title: "The accuracy ladder, in three numbers",
      body: [
        "When someone asks how accurate the hardware is, they are really asking which rung of a ladder they can reach. Out of the box, with no corrections at all, expect about 30 cm. Turn on free Galileo HAS, which the TX2 and FPL decode with no subscription and no internet, and you are at roughly 20 cm horizontally anywhere on Earth. Add a correction source and the answer splits by which one: a regional service like PointPerfect Flex gives 3 to 6 cm, while true RTK from your own base or a network puts you at 1 to 2 cm. The 1 to 6 cm often quoted as one band is really those two rungs stacked.",
        "One caveat that belongs with every figure above: they are horizontal. Vertical error runs roughly twice horizontal, because every satellite is above the horizon and none are below it, so the geometry is weaker in that axis. It matters the moment someone is working to an elevation rather than a position.",
        "Then turn the question around and ask what the work actually requires. Most GIS specifications sit between 10 cm and a meter, so the honest answer is often simpler than the one someone came in asking for. Matching the recommendation to the specification is the job: equipment that overshoots the requirement costs more, and it still has to be carried up the hill."
      ],
      keys: [
        "About 30 cm out of the box.",
        "About 20 cm horizontal, 40 cm vertical, with free Galileo HAS on TX2 or FPL.",
        "3 to 6 cm from a regional service like Flex; 1 to 2 cm from RTK off a base or a network.",
        "Every one of those is horizontal. Vertical is roughly twice the number.",
        "Always follow with: what does your workflow actually require?"
      ],
      links: [
        { label: "SparkPNT documentation", url: "https://docs.sparkpnt.com", kind: "doc" },
        { label: "Galileo High Accuracy Service (official)", url: "https://www.gsc-europa.eu/galileo/services/galileo-high-accuracy-service-has", kind: "read" }
      ],
      figure: "<svg viewBox=\"0 0 480 176\" role=\"img\" aria-label=\"Accuracy by correction source, from 30 cm with none to 1 to 2 cm with RTK\"><text x=\"0\" y=\"14\" font-size=\"11\" fill=\"#8A8F98\">bar length is the error, so shorter is better</text><text x=\"0\" y=\"46\" font-size=\"11\" fill=\"#171717\">No corrections</text><rect x=\"176\" y=\"34\" width=\"210.0\" height=\"17\" rx=\"3\" fill=\"#8A8F98\"/><text x=\"394.0\" y=\"47\" font-size=\"10.5\" fill=\"#8A8F98\">~30 cm</text><text x=\"0\" y=\"80\" font-size=\"11\" fill=\"#171717\">Galileo HAS (free)</text><rect x=\"176\" y=\"68\" width=\"140.0\" height=\"17\" rx=\"3\" fill=\"#108474\"/><text x=\"324.0\" y=\"81\" font-size=\"10.5\" fill=\"#8A8F98\">~20 cm H, 40 cm V</text><text x=\"0\" y=\"114\" font-size=\"11\" fill=\"#171717\">Regional service, Flex</text><rect x=\"176\" y=\"102\" width=\"42.0\" height=\"17\" rx=\"3\" fill=\"#0F4269\"/><text x=\"226.0\" y=\"115\" font-size=\"10.5\" fill=\"#8A8F98\">3 to 6 cm</text><text x=\"0\" y=\"148\" font-size=\"11\" fill=\"#171717\">RTK: own base or network</text><rect x=\"176\" y=\"136\" width=\"14.0\" height=\"17\" rx=\"3\" fill=\"#4D7C0F\"/><text x=\"198.0\" y=\"149\" font-size=\"10.5\" fill=\"#8A8F98\">1 to 2 cm</text></svg>",
      check: { q: "A caller asks 'how accurate is it really?'. Give the whole answer.", a: "About 30 cm out of the box, about 20 cm with free Galileo HAS on TX2 or FPL, 3 to 6 cm with a regional service and 1 to 2 cm with RTK off a base or network - all horizontal, with vertical about twice that. Then ask what the work actually requires." }
    },
    {
      id: "precision-accuracy",
      title: "Precision is not accuracy",
      body: [
        "Precision is how tightly repeated measurements cluster. Accuracy is whether that cluster sits on the truth. A base station set up on a guessed position produces beautifully precise measurements of the wrong place, and nothing in the field display will tell you.",
        "That distinction has a practical form: relative accuracy means your points are correct with respect to each other, which is all a stockpile volume or a site layout needs. Absolute accuracy means they are correct with respect to the real world, which is what boundary work, stakeout against design plans, drone ground control and permanent monitoring networks all require."
      ],
      keys: [
        "Relative work: volumes, site-internal layout, anything self-contained.",
        "Absolute work: boundaries, stakeout against plans, drone ground control, control networks, deformation monitoring.",
        "A guessed base position gives perfect precision and poor accuracy."
      ],
      links: [
        { label: "NOAA CORS, the national reference frame in practice", url: "https://geodesy.noaa.gov/CORS/", kind: "read" }
      ],
      check: { q: "Which one does a stockpile volume need?", a: "Relative accuracy only. The points must be right with respect to each other; the whole pile can sit a meter off the real world without affecting the volume." }
    },
    {
      id: "datum",
      title: "Datum versus projection",
      body: [
        "The datum is the reference frame the coordinates are expressed in. WGS84 and NAD83 sit about 1 to 2 m apart in the United States, which is why a dataset can look uniformly shifted by exactly that much. The datum is the receiver's business and has to be right at collection time.",
        "The projection, meaning UTM or State Plane, is math applied afterwards in the GIS. It is reversible in about ten seconds and most field apps never even ask. When a customer in the field is agonising over which State Plane zone to pick, the useful answer is that it does not matter yet.",
        "Worth tracking: NGS is replacing NAD83, and the changeover will generate a wave of datum questions."
      ],
      keys: [
        "Datum = reference frame, must be right at collection.",
        "Projection = later math, reversible, not a field decision.",
        "A whole dataset shifted uniformly by 1 to 2 m means datum mismatch or a wrong base position, and it is fixable by re-referencing rather than re-collecting."
      ],
      links: [
        { label: "NGS datum modernization", url: "https://www.ngs.noaa.gov/datums/newdatums/", kind: "read" }
      ],
      check: { q: "Every point in a delivered dataset is off by the same 1.5 m. What are the two suspects?", a: "A datum mismatch (WGS84 against NAD83) or a wrong base position. Either way it is re-referenced, not re-collected." }
    }
  ],
  exam: [
    { type: "mc", q: "Which of these is NOT one of the error sources that keeps a standalone receiver at meter level?",
      options: ["Ionospheric delay", "Multipath off buildings", "The projection the GIS uses", "Satellite clock drift"],
      answer: 2,
      why: "A projection is math applied in software after collection. It cannot move a measured position; it only changes how that position is expressed." },
    { type: "mc", q: "A customer with no corrections at all asks what accuracy to expect.",
      options: ["About 1 cm, the same as RTK", "About 30 cm", "About 5 m, the same as a phone", "It cannot be predicted in advance"],
      answer: 1,
      why: "About 30 cm out of the box. SBAS/WAAS is the free floor at roughly a meter, and modern multi-band receivers do better than that unaided." },
    { type: "mc", q: "Which of these does NOT need absolute accuracy?",
      options: ["Boundary and cadastral work against county records", "Stockpile volumes measured from one base each week", "Construction stakeout against a design file", "Ground control for a drone mapping flight"],
      answer: 1,
      why: "A volume only needs the points to be right with respect to each other. The whole pile can sit a meter from its true position without changing the answer. The other three all have to agree with something outside the job." },
    { type: "text", q: "Explain the difference between precision and accuracy using a base station.",
      accept: ["precis", "accur"],
      answer: "Precision is how tightly the measurements repeat; accuracy is whether they sit on the truth. A base on a guessed position gives beautifully precise measurements of the wrong place." },
    { type: "text", q: "Give the three-number accuracy answer.",
      accept: ["30", "20", "cm"],
      answer: "About 30 cm out of the box, about 20 cm with free Galileo HAS on TX2 or FPL, then 3 to 6 cm with a regional service or 1 to 2 cm with RTK off a base or a network. Those are horizontal; vertical is roughly double. Then ask what the work actually requires." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "how-rtk",
  title: "How RTK works",
  goal: "Explain RTK to a farmer and to an engineer, and read the solution states well enough to troubleshoot them.",
  minutes: 25,
  lessons: [
    {
      id: "mechanism",
      title: "The base, the rover, and the shared lie",
      body: [
        "Put a second receiver on a tripod and leave it still. It sees the same satellites through the same slice of atmosphere as the rover a few kilometers away, so it suffers almost exactly the same errors. Because it knows it is not moving, any wobble in its computed position must be error rather than motion.",
        "The base broadcasts what it observes as RTCM messages. The rover subtracts those shared errors, which is called common-mode cancellation, and that alone takes it from meters to decimeters. The last step to centimeters is carrier-phase ambiguity resolution: the receiver works out how many whole wavelengths of the carrier signal lie between it and each satellite, and once those integers lock, the solution is centimeter-class.",
        "For a farmer: the base is a friend standing on a known spot shouting 'the GPS is lying by this much right now', and the rover corrects for the lie in real time."
      ],
      keys: [
        "The base sends observations as RTCM, not a position.",
        "Common-mode cancellation removes the shared atmospheric and orbit error.",
        "Carrier-phase ambiguity resolution is what buys the last step to 1 cm."
      ],
      links: [
        { label: "Setting up a rover-base RTK system", url: "https://learn.sparkfun.com/tutorials/setting-up-a-rover-base-rtk-system", kind: "read" },
        { label: "SparkFun on YouTube (search RTK for walkthroughs)", url: "https://www.youtube.com/@sparkfun", kind: "video" }
      ],
      figure: "<svg viewBox=\"0 0 480 210\" role=\"img\" aria-label=\"A satellite signal reaches base and rover through the same atmosphere, so the shared error cancels\"><text x=\"240\" y=\"16\" text-anchor=\"middle\" font-size=\"11\" fill=\"#8A8F98\">one satellite, two receivers, the same slice of sky</text><circle cx=\"240\" cy=\"42\" r=\"11\" fill=\"#0F4269\"/><path d=\"M232 34 L222 24 M248 34 L258 24\" stroke=\"#0F4269\" stroke-width=\"2\"/><rect x=\"60\" y=\"70\" width=\"360\" height=\"30\" fill=\"#FFDDBF\" opacity=\".55\"/><text x=\"70\" y=\"89\" font-size=\"10.5\" fill=\"#8a6d3b\">atmosphere: the same delay for both, because they look through the same part of it</text><line x1=\"236\" y1=\"54\" x2=\"130\" y2=\"150\" stroke=\"#D7DBE0\" stroke-width=\"1.5\" stroke-dasharray=\"4 3\"/><line x1=\"244\" y1=\"54\" x2=\"352\" y2=\"150\" stroke=\"#D7DBE0\" stroke-width=\"1.5\" stroke-dasharray=\"4 3\"/><rect x=\"98\" y=\"150\" width=\"64\" height=\"26\" rx=\"5\" fill=\"#fff\" stroke=\"#171717\" stroke-width=\"1.5\"/><text x=\"130\" y=\"167\" text-anchor=\"middle\" font-size=\"11\" fill=\"#171717\">BASE</text><text x=\"130\" y=\"192\" text-anchor=\"middle\" font-size=\"10\" fill=\"#8A8F98\">knows it is not moving,</text><text x=\"130\" y=\"204\" text-anchor=\"middle\" font-size=\"10\" fill=\"#8A8F98\">so any wobble is error</text><rect x=\"320\" y=\"150\" width=\"64\" height=\"26\" rx=\"5\" fill=\"#fff\" stroke=\"#171717\" stroke-width=\"1.5\"/><text x=\"352\" y=\"167\" text-anchor=\"middle\" font-size=\"11\" fill=\"#171717\">ROVER</text><text x=\"352\" y=\"192\" text-anchor=\"middle\" font-size=\"10\" fill=\"#8A8F98\">subtracts the shared error,</text><text x=\"352\" y=\"204\" text-anchor=\"middle\" font-size=\"10\" fill=\"#8A8F98\">then resolves the ambiguities</text><line x1=\"166\" y1=\"163\" x2=\"316\" y2=\"163\" stroke=\"#E0311D\" stroke-width=\"1.5\" marker-end=\"url(#ar)\"/><text x=\"241\" y=\"157\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#E0311D\">RTCM: what the base observed</text><defs><marker id=\"ar\" markerWidth=\"7\" markerHeight=\"7\" refX=\"6\" refY=\"3.5\" orient=\"auto\"><path d=\"M0 0 L7 3.5 L0 7 z\" fill=\"#E0311D\"/></marker></defs></svg>",
      check: { q: "What does the base actually transmit?", a: "Its raw observations as RTCM messages, not a corrected position. The rover does the subtraction." }
    },
    {
      id: "states",
      title: "Fix, Float, and the states in between",
      body: [
        "Autonomous or SBAS means no corrections are being used: meter level. DGPS, differential GPS, is decimeter-ish. RTK Float means corrections are arriving and the receiver is working, but the carrier-phase ambiguities have not resolved yet: decimeter, not finished. RTK Fix means they have resolved: centimeter, the green dot everyone is waiting for.",
        "Float is not a failure state, it is an unfinished one, and the difference matters when someone reports being 'stuck'. Ask what the state actually says before assuming the corrections are broken."
      ],
      keys: [
        "Autonomous/SBAS: meters. DGPS: decimeters. Float: decimeters, still working. Fix: centimeters.",
        "Float with corrections flowing usually means sky view, baseline distance, or message format."
      ],
      links: [
        { label: "RTK Everywhere firmware manual", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/", kind: "doc" },
        { label: "GNSS menu reference", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_gnss/", kind: "doc" }
      ],
      check: { q: "What is the difference between Float and Fix?", a: "Both have corrections; Float has not resolved the carrier-phase ambiguities yet and sits at decimeter level, Fix has and sits at centimeter level." }
    },
    {
      id: "baseline",
      title: "The ten kilometer rule",
      body: [
        "The whole trick depends on base and rover seeing the same atmosphere. That assumption holds well to about 10 km and degrades steadily beyond it as the errors decorrelate. Past roughly 35 km, sitting in Float is the expected behaviour rather than a fault.",
        "This is why 'how far are you from your base or your mountpoint?' belongs near the top of every troubleshooting ladder. It converts an argument about hardware into a question of geometry."
      ],
      keys: [
        "Roughly 10 km for reliable Fix.",
        "Beyond about 35 km, Float is normal and not a defect.",
        "Distance is a first-tier troubleshooting question, not an afterthought."
      ],
      links: [],
      check: { q: "Why does RTK degrade with distance?", a: "Base and rover stop sharing the same atmosphere, so the errors decorrelate and subtracting the base's observations no longer cancels the rover's." }
    },
    {
      id: "age",
      title: "Age of differential, the health meter",
      body: [
        "Age of differential is how long ago the last correction arrived. A few seconds is healthy. If it climbs steadily, the correction stream has been interrupted and the link is the suspect: the radio, the cell connection, the caster, the credentials. The GNSS engine is fine.",
        "It is the fastest way to split a problem in half, because it tells you which side of the system to look at before you touch anything."
      ],
      keys: [
        "A few seconds is healthy.",
        "A climbing age means the link stopped, not the receiver.",
        "Check it before changing any receiver setting."
      ],
      links: [],
      check: { q: "Age of differential is at 45 seconds and rising. Where do you look?", a: "At the correction path: radio link, cell connection, caster, mountpoint or credentials. Not at the GNSS configuration." }
    }
  ],
  exam: [
    { type: "mc", q: "What takes a rover the last step from decimeters to about a centimeter?",
      options: ["A stronger antenna with a better ground plane", "Carrier-phase ambiguity resolution", "More satellites in view for better geometry", "A faster position update rate"],
      answer: 1,
      why: "Common-mode cancellation gets you to decimeters. Resolving the integer number of carrier wavelengths is what buys centimeters." },
    { type: "mc", q: "A rover is 40 km from its base and will not leave Float. What is going on?",
      options: ["The base station has failed", "The corrections are in the wrong RTCM format", "This is expected behaviour at that distance", "The antenna cable has worked loose"],
      answer: 2,
      why: "Past roughly 35 km the atmosphere is no longer shared, so Float is the normal outcome. Nothing is broken." },
    { type: "mc", q: "Age of differential has climbed to a minute. What does that tell you?",
      options: ["The receiver needs a factory reset", "The correction link has been interrupted", "The satellites are reporting unhealthy", "The datum has been set incorrectly"],
      answer: 1,
      why: "Age of differential measures the correction stream. When it climbs, corrections stopped arriving, so the problem is in the link." },
    { type: "text", q: "Explain RTK to a farmer in one or two sentences.",
      accept: ["base"],
      answer: "The base is a friend standing on a known spot shouting how much the GPS is lying by right now, and the rover corrects for the lie in real time." },
    { type: "text", q: "Put these in order of accuracy, worst to best: RTK Fix, Autonomous, RTK Float, DGPS.",
      accept: ["autonomous", "dgps", "float", "fix"],
      answer: "Autonomous (meters), DGPS (decimeters), RTK Float (decimeters but still resolving), RTK Fix (centimeters)." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "delivery",
  title: "Getting corrections to the receiver",
  goal: "Know every path a correction can travel, and pick the one that suits a site.",
  minutes: 25,
  lessons: [
    {
      id: "ntrip",
      title: "NTRIP, corrections over the internet",
      body: [
        "NTRIP, the Networked Transport of RTCM via Internet Protocol, is the standard way to move corrections over an internet connection. A caster hosts streams, each one a mountpoint, and a client connects and pulls the stream it needs. It needs cell coverage or WiFi at the point of use.",
        "The detail that causes real support calls: the client can live in two places. It can run in the GIS app on the phone, using the phone's internet and pushing corrections to the receiver over Bluetooth, or it can run inside the receiver itself using its own WiFi. Only one should be running. Two clients fighting over the same receiver produces symptoms that look like hardware faults."
      ],
      keys: [
        "Caster hosts mountpoints, client pulls a stream.",
        "The client lives either in the phone app or in the receiver, never usefully in both.",
        "Some mountpoints, particularly VRS (virtual reference station), need the receiver to upload a GGA sentence, the NMEA message carrying its own rough position, before they will send anything back."
      ],
      links: [
        { label: "PointPerfect and correction menus", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_pointperfect/", kind: "doc" }
      ],
      check: { q: "Why does it matter where the NTRIP client runs?", a: "Because the failure symptoms differ, and because running one in the app and one in the receiver at the same time makes them fight." }
    },
    {
      id: "radio",
      title: "Radio links, for sites with no internet",
      body: [
        "The Facet FP units carry LoRa, which reaches kilometers with clear line of sight and a few hundred meters once trees and terrain get in the way. The TX2 uses ESP-NOW on 2.4 GHz, good for roughly 250 m line of sight. No internet is involved at all, which is exactly the point on a ranch or a remote site.",
        "Base and rover have to match: same radio type, same channel, same settings. That single sentence explains a large share of 'it stopped working' calls, especially after someone joined a new WiFi network and the radio channel moved with it."
      ],
      keys: [
        "LoRa on FP: kilometers clear, hundreds of meters cluttered.",
        "ESP-NOW on TX2: roughly 250 m line of sight.",
        "Base and rover must match on radio type, channel and settings."
      ],
      links: [
        { label: "Base menu reference", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_base/", kind: "doc" }
      ],
      check: { q: "A LoRa base-rover pair works in a field and fails in a wooded valley. Why?", a: "LoRa needs near line of sight. Trees and terrain cut kilometers down to hundreds of meters." }
    },
    {
      id: "satellite",
      title: "Corrections from satellites",
      body: [
        "Galileo broadcasts its High Accuracy Service on the E6 signal: free, no account, no internet. The published service level is 20 cm horizontally and 40 cm vertically at 95 percent confidence, converging in under five minutes. Internally you will hear \"better than 20 cm\"; the official figure is 20 cm horizontal, so quote it that way. The TX2 and FPL decode it natively. The FPM cannot, because the mosaic-X5 does not support it.",
        "One open item to handle carefully: the u-blox ZED-X20P datasheet in the FPX lists HAS support at chip level, but product-level support is not confirmed. Say that plainly rather than promising it.",
        "L-Band satellite corrections are the commercial version of the same idea, and they have their own recent history, covered in the next chapter."
      ],
      keys: [
        "Galileo HAS: free, satellite-delivered, 20 cm horizontal and 40 cm vertical at 95 percent, no internet or account.",
        "TX2 and FPL decode HAS. FPM does not.",
        "FPX chip-level HAS is listed in the datasheet but unverified at product level - do not promise it."
      ],
      links: [
        { label: "Galileo High Accuracy Service", url: "https://www.gsc-europa.eu/galileo/services/galileo-high-accuracy-service-has", kind: "read" },
        { label: "u-blox ZED-X20P module", url: "https://www.u-blox.com/en/product/zed-x20p-module", kind: "doc" }
      ],
      check: { q: "Which unit in the line cannot use Galileo HAS?", a: "The FPM. Its Septentrio mosaic-X5 does not support HAS." }
    },
    {
      id: "osr-ssr",
      title: "OSR and SSR, two ways to describe an error",
      body: [
        "OSR, observation space representation, sends real observations from a real station, or a network's interpolation between stations. That is classic RTK and network RTK: 1 to 2 cm, fast to recover, but you have to be near the stations and coverage has holes.",
        "SSR, state space representation, models the individual error sources - clocks, orbits, ionosphere - across a whole region and broadcasts the model. PointPerfect Flex and Galileo HAS both work this way: 3 to 6 cm for Flex, converging over seconds to minutes, but continuous coverage across a continent with no gaps between stations.",
        "The rule of thumb worth memorising: OSR is a correction made for exactly where you are standing. SSR is a weather map of GNSS errors, and your receiver reads its own forecast off the map."
      ],
      keys: [
        "OSR: station observations, 1 to 2 cm, gaps between stations.",
        "SSR: a broadcast error model, 3 to 6 cm, continental and continuous.",
        "OSR is a correction for your spot; SSR is a map you read your own forecast from."
      ],
      links: [],
      check: { q: "Why can SSR cover a whole continent when network RTK cannot?", a: "It broadcasts a model of the error sources rather than observations from stations, so there are no gaps between stations to fall into." }
    }
  ],
  exam: [
    { type: "mc", q: "Which correction path needs no internet connection at all?",
      options: ["NTRIP corrections pulled over a cell connection", "A LoRa link from your own base", "Galileo HAS on the E6 signal", "Both the LoRa link and Galileo HAS"],
      answer: 3,
      why: "NTRIP is the only one of the three that requires an internet connection. A radio link and a satellite-broadcast service both work in dead zones." },
    { type: "mc", q: "A VRS mountpoint connects, bytes flow, and no corrections ever apply. What is the classic cause?",
      options: ["The GGA position upload is switched off", "The antenna cable has failed intermittently", "The datum is set to NAD83 rather than WGS84", "The battery is too low to drive the radio"],
      answer: 0,
      why: "A VRS caster builds a virtual station at your location, so it needs your approximate position first. With GGA upload off it has nothing to work from." },
    { type: "mc", q: "Which of these describes SSR?",
      options: ["Observations sent from the nearest physical reference station", "A model of clock, orbit and ionosphere errors broadcast over a region", "A file format for post-processing logged data", "A radio protocol for base to rover links"],
      answer: 1,
      why: "SSR broadcasts the modelled state of the error sources, which is why it covers continents continuously and converges rather than snapping in." },
    { type: "text", q: "Give the one-line rule of thumb for OSR against SSR.",
      accept: ["osr", "ssr"],
      answer: "OSR is a correction made for where you are standing. SSR is a weather map of GNSS errors, and your receiver reads its own forecast off the map." },
    { type: "text", q: "Where can an NTRIP client live, and why does it matter?",
      accept: ["app", "device"],
      answer: "In the GIS app on the phone, using phone internet over Bluetooth, or inside the receiver on its own WiFi. Running both at once makes them conflict, and the symptoms differ depending on which path is broken." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "sources",
  title: "Choosing a correction source",
  goal: "Recommend a correction source in the right order, starting with the free one.",
  minutes: 30,
  lessons: [
    {
      id: "state-rtn",
      title: "Free state networks, and the first question to ask",
      body: [
        "Several US states run free real-time networks: Minnesota, Ohio, Washington, South Carolina, Kentucky, Tennessee, Iowa and others. Some need a free registration. They deliver 1 to 2 cm and cost nothing, which makes them the single best opening move with a new customer.",
        "So the first question to any US caller is: which state are you in? Colorado, where the company sits, has no free statewide network - only a local one in Mesa County - which is why the honest answer there is a paid service, their own base, or post-processing."
      ],
      keys: [
        "Ask the state before recommending anything.",
        "Free RTNs give 1 to 2 cm where they exist.",
        "Colorado has no free statewide RTN."
      ],
      links: [
        { label: "NOAA CORS network map", url: "https://geodesy.noaa.gov/CORS/", kind: "tool" }
      ],
      check: { q: "Why start with the free option?", a: "Because where one exists it genuinely is the right answer at 1 to 2 cm for nothing. Nobody should pay a subscription that duplicates what their state already provides." }
    },
    {
      id: "rtk2go",
      title: "RTK2go and community casters",
      body: [
        "RTK2go is a volunteer NTRIP caster. Anyone can publish a base and anyone can consume one. It is free, has no service guarantee, and mountpoints appear and disappear without notice. Useful for hobbyists, for testing, and for sharing your own base with a rover somewhere else.",
        "Watch for it in support: a unit that spent time on a test bench can arrive at a customer with an RTK2go client still enabled, quietly feeding corrections from a stranger's base."
      ],
      keys: [
        "Free, community-run, no guarantees.",
        "A leftover RTK2go client is a real source of ghost corrections."
      ],
      links: [
        { label: "RTK2go caster", url: "http://rtk2go.com", kind: "tool" }
      ],
      check: { q: "What is the support risk with RTK2go?", a: "A leftover client from bench testing keeps pulling corrections from someone else's base, which confuses every diagnosis until you find it." }
    },
    {
      id: "flex",
      title: "PointPerfect Flex, the ninety percent answer",
      body: [
        "Flex is $15 a month for PPP-RTK corrections delivered over NTRIP. It gives 3 to 6 cm, converges in seconds, and covers the contiguous United States, which is to say not Alaska or Hawaii, plus Canada, Europe, Brazil, South Korea, Australia and about 12 nautical miles offshore. The device has to be registered to the account.",
        "There are usage-based and pooled-hourly plans, which suit seasonal agriculture well. MQTT/SPARTN was the older delivery path and is deprecated; NTRIP is current.",
        "There is a second tier above it. PointPerfect Live is announced as the network-RTK-grade service, 1 to 2 cm rather than 3 to 6. u-blox says to contact them for pricing, and our own manual records it as announced but not launched. Two things circulate internally about it: a price of about $150 a month, and a theory that it resells Topcon's network. Neither is verified. Say it is announced and not yet launched, with no public pricing, and stop there.",
        "Paired with a TX2, Flex is the setup that answers most enquiries: a green dot in the field app for fifteen dollars a month."
      ],
      keys: [
        "$15/month, 3 to 6 cm, converges in seconds.",
        "PointPerfect Live is the announced 1 to 2 cm tier. Not launched, no public price, and the internal figure must never be quoted.",
        "Contiguous US (not Alaska or Hawaii), Canada, Europe, Brazil, South Korea, Australia. Device registration required.",
        "Usage-based plans exist for seasonal work.",
        "NTRIP is the current path; MQTT/SPARTN is deprecated."
      ],
      links: [
        { label: "PointPerfect (u-blox)", url: "https://www.u-blox.com/en/product/pointperfect", kind: "read" },
        { label: "PointPerfect setup in the firmware", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_pointperfect/", kind: "doc" }
      ],
      check: { q: "What accuracy does Flex deliver, and how fast?", a: "3 to 6 cm, converging in seconds, over continental coverage." }
    },
    {
      id: "lband",
      title: "The L-Band history, know it cold",
      body: [
        "u-blox suspended the North American PointPerfect L-Band satellite service on 31 December 2025. Facet L-Band owners lost their satellite corrections overnight. The units still work fully, but they need an internet correction source now.",
        "A global L-Band service has been announced with no set date. 'Maybe Q4 2026' is unconfirmed and must never be repeated as a promise. The FPX hardware is L-Band capable, and capability is not the same thing as an active service.",
        "When one of those owners calls, lead with empathy rather than policy: they are right to be annoyed. Then walk the options: a free state network, Flex at $15 a month, or their own base. Refund demands escalate."
      ],
      keys: [
        "NA L-Band suspended 31 December 2025.",
        "Units still work, they need internet corrections now.",
        "Global service announced, no date. Never promise one.",
        "L-Band capable hardware is not an active L-Band service."
      ],
      links: [],
      check: { q: "An angry Facet L-Band owner calls. What is the opening move?", a: "Empathy first: they are right, u-blox discontinued the satellite service at the end of 2025. Then the options, and escalate refund demands." }
    },
    {
      id: "own-base",
      title: "Your own base, and the recommendation script",
      body: [
        "An FP as a base with a radio link to a rover gives about 1 cm relative, no subscription, and works with no cell coverage at all. Absolute accuracy depends entirely on how the base position was established, which is the next chapter. It is two devices rather than one, so it costs more up front and then costs nothing to run.",
        "It is worth being able to say why the two differ. Flex broadcasts a regional model of the errors, which is why it covers a continent and why it is a little coarser at 3 to 6 cm. A base a few kilometers away cancels the errors exactly where you are standing, which is why it reaches 1 to 2 cm. Flex wins for roaming on a budget with cell coverage; the base wins for daily centimeter work, for fleets, and for anywhere without cell.",
        "The order to run through: free state network if one exists, Flex at $15 a month if there is cell coverage, Galileo HAS if the need is sub-half-meter or the site is offline or overseas, their own base for true centimeter work every day or where there is no cell, and if they already pay for SmartNet or VRS Now through their firm, tell them to keep it. Commercial networks run $800 to $3,000 a year for 1 to 2 cm, and they are standard NTRIP, so the hardware plugs straight in."
      ],
      keys: [
        "Own base: about 1 cm relative, no subscription, no cell needed.",
        "Script order: free RTN, Flex, HAS, own base, keep an existing commercial subscription.",
        "Commercial networks are standard NTRIP, so our hardware works with them."
      ],
      links: [],
      check: { q: "No cell at the site and they need centimeters. What do you recommend?", a: "An FP base and rover pair linked over LoRa. No internet involved." }
    }
  ],
  exam: [
    { type: "mc", q: "A customer in Colorado wants centimeter accuracy. Which is NOT one of their real options?",
      options: ["PointPerfect Flex at $15 a month", "A free statewide real-time network", "Their own base station and rover", "A paid commercial network subscription"],
      answer: 1,
      why: "Colorado has no free statewide RTN. Only Mesa County runs a local one, so the honest answer is Flex, their own base, or a paid network." },
    { type: "mc", q: "What happened to PointPerfect L-Band in North America?",
      options: ["It was upgraded to 1 cm accuracy", "u-blox suspended it on 31 December 2025", "It moved to a $150 a month tier", "It was never offered in North America"],
      answer: 1,
      why: "The service was suspended at the end of 2025. Affected units still work but need an internet correction source." },
    { type: "mc", q: "A customer asks what PointPerfect Live costs. What do you say?",
      options: ["About $150 a month, per the note in our own docs", "It is announced but not launched, with no public price", "The same $15 a month as Flex", "Free with any receiver bought after 2025"],
      answer: 1,
      why: "It is announced and not launched. The $150 figure circulating internally is unverified and must not be quoted to a customer." },
    { type: "text", q: "Why check the free correction options before recommending a paid one?",
      accept: ["free", "need", "right"],
      answer: "Because if a free source meets the accuracy they need, it is the correct recommendation. A paid subscription layered on top of something their state already provides costs them money and buys them nothing." },
    { type: "text", q: "A farmer asks why $15/month Flex gives 3 to 6 cm while his own base gives about 1 cm.",
      accept: ["model", "region", "base", "local"],
      answer: "Flex broadcasts a regional error model, so it covers everywhere but slightly coarser. A local base cancels the errors exactly where he is standing. Flex wins for roaming on a budget with cell coverage; the base wins for daily centimeter work or where there is no cell." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "base-setup",
  title: "Standing up a base",
  goal: "Choose between Survey-In and a fixed position, and know what each one does to the data.",
  minutes: 20,
  lessons: [
    {
      id: "survey-in",
      title: "Survey-In: fast, self-consistent, and floating",
      body: [
        "In Survey-In the base averages its own position for a while and then uses that average. Absolute accuracy of that guess is only about 0.5 to 2 m. Everything the rover measures afterwards is perfectly consistent relative to it, which is all that a volume calculation or a site-internal layout needs.",
        "The catch is that a re-run Survey-In lands on a slightly different guess every time. On a permanent installation, that means the whole site wobbles between sessions."
      ],
      keys: [
        "Absolute accuracy of a Survey-In position: roughly 0.5 to 2 m.",
        "Relative accuracy within the session is unaffected.",
        "Re-running it moves the whole site."
      ],
      links: [
        { label: "Base configuration menu", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_base/", kind: "doc" }
      ],
      check: { q: "When is Survey-In perfectly acceptable?", a: "Temporary setups and relative work: stockpile volumes, site-internal layout, anything that never has to agree with the outside world." }
    },
    {
      id: "fixed-base",
      title: "Fixed base, and the ranked ways to get a true position",
      body: [
        "In a fixed base you tell the receiver its true coordinates, and rover positions become absolutely accurate. A permanent installation then gives the same answers year after year.",
        "The ways to get that true position, best first: a published survey monument, which is instant and authoritative; OPUS or CSRS-PPP post-processing of a static log; letting a correction service position the base live and then locking that coordinate in; and last, a very long Survey-In, which is still only decimeter-class.",
        "For any job that matters, log raw data at the base as well. It costs nothing, and it is what makes the rescue workflow in chapter 6 possible.",
        "The one-line rule to carry out of this chapter: precision is not accuracy. A base standing on a guessed position gives beautifully precise measurements of the wrong place, and nothing on the screen will tell you."
      ],
      keys: [
        "Published monument, then OPUS/CSRS-PPP, then a service-derived position, then long Survey-In.",
        "Fixed base for anything permanent.",
        "Log raw data at the base on jobs that matter."
      ],
      links: [
        { label: "NOAA OPUS", url: "https://geodesy.noaa.gov/OPUS/", kind: "tool" },
        { label: "CSRS-PPP (Canada)", url: "https://webapp.csrs-scrs.nrcan-rncan.gc.ca/geod/tools-outils/ppp.php", kind: "tool" }
      ],
      check: { q: "Rank the ways to give a base a true position.", a: "Published monument, OPUS or CSRS-PPP of a static log, a corrections service positioning it live, then a very long Survey-In as the weakest." }
    }
  ],
  exam: [
    { type: "mc", q: "A contractor wants a permanent base on the workshop roof. Which mode?",
      options: ["Survey-In, re-run at the start of each day", "Fixed base with a surveyed position", "Survey-In once, then never re-run", "Either mode gives the same result"],
      answer: 1,
      why: "A permanent installation needs to give the same answer every year, and only a fixed, known position does that. A re-run Survey-In moves the whole site each time." },
    { type: "mc", q: "Which of these gives the WEAKEST absolute position for a base?",
      options: ["A published survey monument", "OPUS post-processing of a two-hour static log", "A very long Survey-In average", "A correction service positioning it live"],
      answer: 2,
      why: "Even a long Survey-In is decimeter-class at best, because it is still an average of an uncorrected solution." },
    { type: "text", q: "Rank the ways to give a base a true position, best first.",
      accept: ["monument", "opus", "survey"],
      answer: "A published survey monument, then OPUS or CSRS-PPP post-processing of a static log, then letting a correction service position it live and locking that in, and last a very long Survey-In, which is still only decimeter-class." },
    { type: "text", q: "What is the one-line rule about precision and a guessed base position?",
      accept: ["precis"],
      answer: "Precision is not accuracy. A base on a guessed position gives beautifully precise measurements of the wrong place." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "post-processing",
  title: "Logging and post-processing",
  goal: "Set up a job that can be rescued later, and know when to reach for PPK instead of RTK.",
  minutes: 25,
  lessons: [
    {
      id: "cors-opus",
      title: "CORS is infrastructure, OPUS is the tool",
      body: [
        "CORS, the Continuously Operating Reference Stations, is the network of permanent antennas run by the National Geodetic Survey and its partners, recording continuously. It is physical infrastructure, not a live service, and you cannot stream corrections from 'CORS'. When a customer asks to connect to CORS for live work, that is the misunderstanding to clear up.",
        "OPUS, the Online Positioning User Service, is the free NOAA tool that post-processes a static log of yours against nearby CORS stations and returns a position in the national frame. Canada's CSRS-PPP does the same job, accepts data from anywhere in the world, and is often the better choice outside the US."
      ],
      keys: [
        "CORS: permanent recording stations, post-processing infrastructure.",
        "OPUS: the free tool that uses them, after the fact.",
        "Real-time networks are a separate live service layered on the same idea."
      ],
      links: [
        { label: "NOAA CORS", url: "https://geodesy.noaa.gov/CORS/", kind: "read" },
        { label: "OPUS upload", url: "https://geodesy.noaa.gov/OPUS/", kind: "tool" },
        { label: "IGS, the global equivalent", url: "https://www.igs.org/", kind: "read" }
      ],
      check: { q: "A customer wants to 'connect to CORS' for live corrections. What is wrong?", a: "CORS is post-processing infrastructure, not a caster. Live work needs an RTN, a service like Flex, or their own base." }
    },
    {
      id: "opus-reqs",
      title: "What OPUS will accept",
      body: [
        "Four requirements, and a submission that breaks any of them comes back rejected. The data must be static, meaning the receiver never moved. It must be between 15 minutes and 48 hours long. It must not cross UTC midnight more than once. And it must be RINEX, the Receiver Independent Exchange format: the plain-text standard every post-processing service reads, which exists so that data from any receiver can be processed by any software.",
        "Two hours is the sweet spot for a reason. Under two hours your file goes to OPUS-RS, the rapid static service, which needs more nearby reference stations and returns a weaker solution. At two hours or more it goes to the full static service. OPUS also needs dual-frequency carrier phase data, so a single-band log is not a candidate at any length.",
        "The FPM logs RINEX directly, which is why it is the natural choice for anyone whose deliverable goes through OPUS. Other units log raw formats that need a conversion step first."
      ],
      keys: [
        "Static, 15 minutes to 48 hours, at most one UTC midnight crossing, RINEX format, dual-frequency carrier phase.",
        "Under two hours goes to OPUS-RS, rapid static, which is weaker. Two hours or more gets the full static service.",
        "The FPM logs RINEX natively; others need conversion."
      ],
      links: [
        { label: "OPUS", url: "https://geodesy.noaa.gov/OPUS/", kind: "tool" }
      ],
      check: { q: "List the four OPUS requirements.", a: "Static, 15 minutes to 48 hours, no more than one UTC midnight crossing, RINEX format." }
    },
    {
      id: "raw-logging",
      title: "Turning raw logging on, properly",
      body: [
        "Three things have to be true at collection time: a microSD card is seated and detected, both raw logging and the raw observation messages are enabled, and the receiver stays still for the session.",
        "The mental model that stops people getting this wrong: the logging menu is the faucet, and the messages menu decides which water flows through it. Turning on the faucet with no raw messages selected produces a file full of positions and nothing OPUS can use.",
        "Then verify. Open the file listing and confirm the log is actually growing. A session you discover was empty after you have left the site is a wasted day."
      ],
      keys: [
        "Card seated, logging on, raw observation messages on, receiver static.",
        "Logging menu is the faucet, messages menu is the water.",
        "Always confirm the file is growing before you walk away."
      ],
      links: [
        { label: "Data logging menu", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/menu_data_logging/", kind: "doc" }
      ],
      check: { q: "Logging is enabled but OPUS rejects the file. What is the likely cause?", a: "Raw observation messages were never enabled, so the log contains positions rather than the raw observations OPUS needs." }
    },
    {
      id: "rescue",
      title: "Rescuing a day of shifted data",
      body: [
        "This is the workflow that pays for every minute you ever spent logging raw data at a base, and it is worth knowing before you need it.",
        "The situation: a crew collected all day against a base that was set up with Survey-In. The rover data is internally perfect, every point correct relative to every other, but the whole dataset sits somewhere between half a meter and two meters from where it should be, because that is how good a Survey-In guess is. The client wants coordinates that agree with the real world.",
        "If nobody logged at the base, the day is gone and they collect it again. If the base logged raw observations, none of it is lost. You post-process the base log to find where the base truly was, compare that with the guess it used at the time, and the difference is a single offset that applies to every point the rover measured. Apply the shift and the whole dataset lands in the right place.",
        "That is the argument for logging at the base on any job that matters. It costs a microSD card and a menu toggle, and the one time it saves a day of field work it has paid for itself several times over."
      ],
      steps: [
        { do: "Confirm the shift is uniform.", why: "Every point off by the same amount and the same direction means one cause: the base position or the datum. A scattered error is a different problem and this workflow will not fix it." },
        { do: "Submit the base's raw log to OPUS or CSRS-PPP.", why: "That returns where the base actually stood, in the national frame, rather than the average it guessed at the time." },
        { do: "Subtract: true position minus the Survey-In position.", why: "The result is the offset in each axis. This is the whole correction, and it is the same for every rover point because they all referenced the same wrong base." },
        { do: "Apply that offset to every rover point in the GIS.", why: "A single shift operation on the layer. Nobody re-collects anything." },
        { do: "Check one known point if there is one on site.", why: "A monument, a previously surveyed corner, anything independent. It turns 'the maths says so' into 'and it agrees with the ground'." }
      ],
      keys: [
        "A uniform shift is recoverable; a scattered error is not this problem.",
        "The base log is what makes it possible, so log raw at the base on jobs that matter.",
        "OPUS the base log, subtract the guess, shift every rover point by the difference.",
        "Verify against an independent known point if the site has one."
      ],
      links: [
        { label: "NOAA OPUS", url: "https://geodesy.noaa.gov/OPUS/", kind: "tool" },
        { label: "CSRS-PPP (Canada)", url: "https://webapp.csrs-scrs.nrcan-rncan.gc.ca/geod/tools-outils/ppp.php", kind: "tool" }
      ],
      check: { q: "What single fact makes a shifted dataset recoverable rather than lost?", a: "That the base logged raw observations, so its true position can be recovered afterwards and the offset computed. Without that log there is nothing to compare against." }
    },
    {
      id: "ppk-ppp",
      title: "PPK, PPP, and drone work",
      body: [
        "PPK, post-processed kinematic, is the same mathematics as RTK done afterwards, against logged data rather than a live stream. It is the rescue path for canopy and sites where a live link was impossible, and it is the standard drone workflow when there are no ground control points.",
        "PPP, precise point positioning, uses one receiver plus a globally broadcast model of satellite errors, converging over ten minutes or more to decimeter or better with no base at all. Galileo HAS is a free service of this flavour.",
        "For drones, find out which workflow they mean before recommending anything. Ground control points means the pilot walks the site with a handheld rover measuring marked targets, and the rover never touches the aircraft. PPK on the drone means a light receiver rides along logging raw data, processed against a base log after landing."
      ],
      keys: [
        "PPK: RTK maths, done later, on logged data.",
        "PPP: one receiver plus a global error model, converges over minutes.",
        "Ground control points put the rover in the pilot's hands, not on the aircraft."
      ],
      links: [
        { label: "SparkFun GNSS tutorials", url: "https://learn.sparkfun.com/tutorials/tags/gnss", kind: "read" }
      ],
      check: { q: "Someone says 'ground control points'. Where is the rover?", a: "In their hands, on the ground. The drone carries only a camera, and the measured targets appear in the photos." }
    }
  ],
  exam: [
    { type: "mc", q: "Which of these will OPUS reject?",
      options: ["A 3-hour static RINEX log from a tripod", "A 20-minute static RINEX log from a tripod", "A 45-minute log recorded while walking a site", "A 6-hour log that crosses UTC midnight once"],
      answer: 2,
      why: "OPUS is a static-only service. Movement during the session disqualifies it regardless of length or format." },
    { type: "mc", q: "When do you reach for PPK instead of RTK?",
      options: ["Under heavy canopy where a live link fails", "On a site with no cell and no radio path", "Drone mapping without ground control points", "All of the above"],
      answer: 3,
      why: "All three are the same situation from different angles: no usable live correction link, so you log and process afterwards." },
    { type: "mc", q: "Why is the FPM described as the OPUS unit?",
      options: ["It has the longest battery life in the family", "It logs RINEX natively, with no conversion step", "It is the only model with a microSD card slot", "It uploads submissions to OPUS automatically"],
      answer: 1,
      why: "Native RINEX removes the conversion step between the field and the submission, which is where most mistakes happen." },
    { type: "text", q: "A whole day of rover data sits 1.2 m from where it should be. The base ran Survey-In and logged raw data. What do you do?",
      accept: ["opus", "shift", "offset", "post"],
      answer: "Post-process the base log through OPUS to get its true position, compute the offset from the Survey-In guess, and shift every rover point by that offset. The day is saved." },
    { type: "text", q: "Explain the faucet and water model for raw logging.",
      accept: ["log", "messag"],
      answer: "The logging menu is the faucet and the messages menu decides which water flows through it. Logging enabled with no raw observation messages selected gives you a file with nothing useful in it." },
    { type: "text", q: "What is the difference between CORS and OPUS?",
      accept: ["cors", "opus"],
      answer: "CORS is the physical network of permanently recording stations. OPUS is the free tool that post-processes your static log against them. You cannot stream live corrections from CORS." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "products",
  title: "The product line",
  goal: "Know what each unit is for, and what genuinely separates the two that look alike.",
  minutes: 30,
  lessons: [
    {
      id: "tx2",
      title: "TX2, the everyday rover",
      body: [
        "$1,250 (store price, August 2026). A quad-band Quectel LG290P covering L1, L2, L5 and E6, 8 mm with RTK, a 50 hour battery, free Galileo HAS, MFi certification for iOS, an IP67 body and 428 g on the pole.",
        "It is marketed as a rover, but it can act as a base too over ESP-NOW at roughly 250 m line of sight. That is a real differentiator against Emlid's Reach RX, which is rover-only."
      ],
      keys: [
        "50 hour battery, free HAS, MFi for iOS.",
        "Can be a base as well as a rover, unlike the Reach RX.",
        "The default recommendation paired with Flex."
      ],
      links: [
        { label: "SparkPNT product documentation", url: "https://docs.sparkpnt.com", kind: "doc" },
        { label: "sparkpnt.com", url: "https://www.sparkpnt.com", kind: "read" }
      ],
      check: { q: "Name the TX2's three headline strengths.", a: "50 hour battery, free Galileo HAS with no subscription, and MFi certification for iOS. Plus it can act as a base." }
    },
    {
      id: "fp-family",
      title: "The Facet FP family, one body and three engines",
      body: [
        "All three share the same IP67 die-cast magnesium alloy body (store-verified spec), LoRa radio, microSD, WiFi, Bluetooth, OLED display and browser configuration. What differs is the Flex module, the GNSS engine itself, which a user can swap with a Phillips screwdriver in about five minutes. Nothing else in the industry does that: a new receiver in three years is a module purchase rather than a new device.",
        "The memory hook, revised in August 2026: L is low cost, X is extended endurance and ecosystem, M is for measurement professionals. Note carefully that security does not separate them, because both X and M carry OSNMA.",
        "The FPL at $1,550 (store price, August 2026) runs the same LG290P as the TX2, with a 48 hour battery and Galileo HAS. It is the right answer for most GIS mapping, agriculture and general RTK work on a budget."
      ],
      keys: [
        "User-swappable GNSS engine, unique in the industry.",
        "L = low cost, X = extended endurance and ecosystem, M = measurement professionals.",
        "FPL: same engine as the TX2, in the Facet body."
      ],
      links: [
        { label: "SparkPNT documentation", url: "https://docs.sparkpnt.com", kind: "doc" }
      ],
      check: { q: "What makes the FP family unique?", a: "The GNSS engine is a user-swappable module, so upgrading is a module purchase rather than a new device." }
    },
    {
      id: "fpx-fpm",
      title: "FPX against FPM, the real differentiators",
      body: [
        "This is the comparison that was being got wrong internally, so it is worth learning precisely. Both carry OSNMA, the Galileo Open Service Navigation Message Authentication. It is an anti-spoofing measure: it lets a receiver check that a navigation message genuinely came from the satellite rather than from someone imitating one. Both of them have it. It was corrected in August 2026 and confirmed in both datasheets, so never describe the FPX as the security pick.",
        "The FPX at $1,650 (store price, August 2026) runs the u-blox ZED-X20P: about 0.21 W and roughly three times lower power than the alternative, which is where the 54 hour battery comes from, the longest in the family. It decodes SPARTN, the compact correction format PointPerfect broadcasts in, natively, the hardware is L-Band capable, and it adds platform security in the form of secure boot and secure storage. It updates at 25 Hz.",
        "The FPM at $1,950 (store price, August 2026) runs the Septentrio mosaic-X5: 0.6 cm plus 0.5 ppm horizontally, 100 Hz updates with under 10 ms latency, AIM+, Septentrio's interference mitigation, which actively suppresses jamming rather than merely detecting it, native RINEX and Ethernet, 5 ns timing on the PPS output (the once-per-second pulse that timing equipment disciplines itself to), and MIL-STD-810 vibration qualification. It has a 32 hour battery and cannot do Galileo HAS.",
        "Be careful with the headline accuracy numbers. Both engines are quoted at 0.6 cm horizontal, but u-blox states it as CEP and Septentrio as RMS, which are different statistical measures, so they are not directly comparable and neither is meaningfully more accurate at short range. The honest separator is the ppm term. ppm means parts per million and describes how error grows with distance from the base: 1 ppm adds 1 mm per kilometer. At a 10 km baseline the FPM's 0.5 ppm costs 5 mm where the FPX's 1 ppm costs 10 mm. On a 500 m job neither of those matters.",
        "One line: FPX for endurance and ecosystem, FPM for update rate, jamming immunity and survey deliverables."
      ],
      keys: [
        "Both have OSNMA. Security does not separate them.",
        "FPX: 0.21 W, 54 hr battery, 25 Hz, native SPARTN, L-Band capable, secure boot.",
        "FPM: 100 Hz, AIM+ active anti-jamming, native RINEX, 0.5 ppm, 5 ns timing, no HAS.",
        "Both are 0.6 cm horizontal, but quoted as CEP against RMS, so that number does not separate them. The ppm term does, and only on long baselines.",
        "Open item: the X20P datasheet lists Galileo HAS at chip level, product support unconfirmed."
      ],
      links: [
        { label: "u-blox ZED-X20P", url: "https://www.u-blox.com/en/product/zed-x20p-module", kind: "doc" }
      ],
      check: { q: "Is the FPX more secure than the FPM?", a: "No. Both carry OSNMA. The flavours differ - FPX adds platform security, FPM adds active jamming mitigation - but neither is 'the secure one'." }
    },
    {
      id: "variants",
      title: "The -T variants, the timing line, and firmware",
      body: [
        "The -T variants of each Facet add an integrated IMU, an inertial measurement unit, for pole tilt compensation, at extra cost. It senses how far the pole is leaning so the software can work back to the point on the ground, which means the pole no longer has to be plumb. Check the site for current pricing rather than quoting from memory.",
        "Beyond the mapping line there is a timing line: the SXM-E as a permanent reference station, and the SXT and SXT-D as GNSS-disciplined oscillators. Timing customers speak a different language entirely - PPS, holdover, AtomiChron - and the right play is to take the details carefully and hand them to engineering rather than improvise.",
        "Two firmware generations exist. The original RTK Firmware is per-model with menus that differ between products. RTK Everywhere is a ground-up rewrite: the same menus everywhere, agnostic about correction sources, and one update improves every product. When a caller describes menus that do not match the documentation, the first question is which firmware they are running.",
        "Legacy hardware still in the field: Facet, Facet L-Band, Express, Surveyor and Torch. The painful one is the Facet L-Band, for the reason covered in chapter 4."
      ],
      keys: [
        "-T means an IMU for tilt compensation.",
        "SXT and SXT-D are timing products - take details, hand to engineering.",
        "Two firmware generations. Ask which one before troubleshooting menus.",
        "Facet L-Band owners lost their satellite service at the end of 2025."
      ],
      links: [
        { label: "RTK Everywhere manual", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/", kind: "doc" }
      ],
      check: { q: "A caller describes menus that do not match the manual. First question?", a: "Which firmware are you running? The original RTK Firmware and RTK Everywhere have different menu structures." }
    }
  ],
  exam: [
    { type: "mc", q: "Which statement about OSNMA is correct?",
      options: ["Only the FPX has it, which is why it is the security pick", "Only the FPM has it, alongside AIM+", "Both the FPX and the FPM have it", "Neither has it, it is a Galileo ground segment feature"],
      answer: 2,
      why: "Both carry OSNMA, confirmed in both datasheets in August 2026. Never position the FPX as the security pick on that basis." },
    { type: "mc", q: "A customer asks why they would pay $300 more for the FPM over the FPX. Which is NOT a valid reason?",
      options: ["100 Hz updates instead of 25 Hz", "Stronger anti-spoofing, since the FPX lacks OSNMA", "Native RINEX logging for OPUS", "AIM+ actively mitigates jamming rather than only detecting it"],
      answer: 1,
      why: "Both have OSNMA. The real reasons are update rate, active jamming mitigation, native RINEX, half the ppm error and 5 ns timing." },
    { type: "mc", q: "Which unit would you put on a pole crew doing daily centimeter mapping on a budget?",
      options: ["An FPM-T, for the survey deliverables", "An FPL or FPL-T", "An SXT-D, for the timing precision", "A Facet L-Band from the legacy line"],
      answer: 1,
      why: "The FPL runs the same engine as the TX2 in the Facet body with a 48 hour battery, and the -T adds tilt for pole work. The FPM is for survey deliverables, and the SXT-D is a timing product." },
    { type: "text", q: "What is unique about the Facet FP family compared to everything else on the market?",
      accept: ["swap", "module"],
      answer: "The GNSS engine is a user-swappable module, changed with a Phillips screwdriver in about five minutes. Upgrading is a module purchase, not a new device." },
    { type: "text", q: "A timing customer calls about the SXT. What is the play?",
      accept: ["engineer", "hand", "escalat"],
      answer: "Timing is a different vocabulary - PPS, holdover, disciplined oscillators. Take the details carefully, do not improvise, and hand it to engineering." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "recommending",
  title: "Recommending the right kit",
  goal: "Get from a cold enquiry to the right recommendation in three questions.",
  minutes: 20,
  lessons: [
    {
      id: "three-questions",
      title: "The three questions, before any recommendation",
      body: [
        "Where do you work? That means which state, and whether there is cell coverage at the actual sites. It decides the correction source before it decides the hardware.",
        "What accuracy do you actually need? Dig past 'the best you have'. Ask what the deliverable is and what the pass or fail specification is.",
        "One unit or a fleet, occasional or daily? A single occasional user and a crew of six running every day get different answers even with identical accuracy needs."
      ],
      keys: [
        "Where do you work, including cell coverage.",
        "What accuracy does the workflow actually require.",
        "One unit or a fleet, occasional or daily."
      ],
      links: [],
      check: { q: "Recite the three questions.", a: "Where do you work? What accuracy do you actually need? One unit or a fleet, occasional or daily?" }
    },
    {
      id: "decision-tree",
      title: "The decision tree",
      body: [
        "Foot-level accuracy with any coverage: a TX2 using free Galileo HAS. Centimeters with good cell coverage: a TX2 or FPL with PointPerfect Flex. Centimeters with no cell: an FP base and rover pair over LoRa. Survey-grade deliverables through OPUS: the FPM. Pole work where tilt matters: any -T variant.",
        "For drones, OEM integration and autonomy, the split is endurance against performance. The FPX for long missions, low power and native PointPerfect. The FPM for 100 Hz control loops or heavy RF interference. Both have OSNMA, so security does not decide it.",
        "By customer shape: a solo GIS technician takes a TX2, a pole crew takes FPL-T units, a surveyor takes an FPM or FPM-T, and a ranch with no internet takes two FPs."
      ],
      keys: [
        "No cell plus centimeters means a base and rover pair, every time.",
        "OPUS deliverables means the FPM.",
        "Endurance and ecosystem means FPX; update rate and RF hostility means FPM."
      ],
      links: [],
      check: { q: "Solo GIS technician, good cell coverage, needs about 3 cm. What do you recommend?", a: "A TX2 with a PointPerfect Flex subscription." }
    },
    {
      id: "competitors",
      title: "Competitors, and the Trimble objection",
      body: [
        "Trimble is the giant: integrated systems at $10,000 to $20,000 and up, a walled garden, and subscriptions that stack. Their RTX service is the direct analogue of PointPerfect, a global SSR correction service sold with their hardware. Topcon sits in the same premium tier with Topnet Live. Emlid is closest to us in spirit, though the Reach RX is rover-only and their base-capable units erase the price advantage. u-blox, Septentrio and Quectel are suppliers, not rivals.",
        "The posture is respectful coexistence. Never trash a competitor. The argument that works: an RTK fix is about a centimeter regardless of the logo, because it is the same physics. What the premium buys is robustness at the edges, not a smaller number. Then compare total cost rather than sticker price, because their subscriptions stack, and point at versatility, at repairability with published schematics, at the swappable engine, at MFi for iOS, and at NGS-calibrated antennas.",
        "And always ask what accuracy the work actually needs. A competing quote is often built for a tighter specification than the job requires, and saying so plainly is more useful to the person in front of you than winning the comparison."
      ],
      keys: [
        "Same physics, same centimeter. The premium buys edge robustness.",
        "Compare total cost, not sticker price.",
        "Differentiators: open firmware, right to repair, swappable engine, MFi, NGS-calibrated antennas, price.",
        "Never trash competitors."
      ],
      links: [
        { label: "Emlid, for honest comparison", url: "https://www.emlid.com", kind: "read" }
      ],
      check: { q: "The simpler setup meets their specification. What do you recommend?", a: "The simpler setup. If it meets the requirement, recommending more is recommending something they cannot use." }
    },
    {
      id: "qualifying",
      title: "Reading an enquiry",
      body: [
        "An enquiry that is not yet a project tends to sound like this: a vague 'huge deployment', names dropped, urgency with no specifics, and a request for free units before anything else. One that is ready sounds different: a named site and state, a named software stack, an actual accuracy specification, a mention of procurement, and precise questions.",
        "This is about how much to invest, not about who deserves an answer. Be generous with information either way, and careful with hardware and long calls until the shape of the project is clear. One question sorts it quickly: what is the pass or fail accuracy specification? A project that is ready answers immediately, and one that is not will tell you it is still being scoped, which is useful to know."
      ],
      keys: [
        "Generous with information either way; careful with hardware and long calls until the project has a shape.",
        "The separating question: what is the pass/fail accuracy spec?",
        "A project that is ready answers immediately."
      ],
      links: [],
      check: { q: "What is the single best qualifying question?", a: "What is the pass or fail accuracy specification for the project? A project that is ready answers immediately." }
    }
  ],
  exam: [
    { type: "mc", q: "A rancher has no cell coverage at any of his sites and needs centimeter accuracy for fence lines.",
      options: ["A TX2 with a PointPerfect Flex subscription", "An FP base and rover pair over LoRa", "A TX2 using free Galileo HAS", "An FPM with an OPUS subscription"],
      answer: 1,
      why: "Flex needs cell. HAS is free and needs no internet, but it delivers about 20 cm, not centimeters. A base and rover pair over radio is the answer." },
    { type: "mc", q: "Which is a legitimate differentiator against Trimble?",
      options: ["Our RTK fix is more accurate than theirs", "Published schematics and a right to repair", "Their receivers cannot accept standard NTRIP", "We are the only vendor offering multi-band"],
      answer: 1,
      why: "The physics is the same, so the fix is not more accurate. The real differentiators are openness, repairability, the swappable engine, MFi, and total cost." },
    { type: "mc", q: "A caller mentions a huge fleet deployment, will not name the site, and asks for free evaluation units. What is this?",
      options: ["A qualified enterprise lead worth a hardware loan", "A procurement process already underway", "Not a defined project yet - worth one qualifying question", "A support case misrouted to sales"],
      answer: 2,
      why: "Vague scale, no specifics and free-hardware-first usually means the project is still being scoped. Ask for the pass/fail accuracy specification, answer their questions either way, and hold the hardware until there is a defined project." },
    { type: "text", q: "Recite the three questions you ask before recommending anything.",
      accept: ["where", "accur", "fleet"],
      answer: "Where do you work, including cell coverage? What accuracy do you actually need? One unit or a fleet, occasional or daily?" },
    { type: "text", q: "A surveyor's deliverable has to go through OPUS. Which unit, and why?",
      accept: ["fpm", "rinex"],
      answer: "The FPM, because it logs RINEX natively and removes the conversion step before an OPUS submission." }
  ]
},

// ─────────────────────────────────────────────────────────────────────────────
{
  id: "support",
  title: "Supporting customers",
  goal: "Work a case from first contact to resolution without bluffing.",
  minutes: 30,
  lessons: [
    {
      id: "four-ideas",
      title: "The four ideas behind ninety percent of calls",
      body: [
        "One: base and rover must match, on radio type, channel and settings. Two: the rover is only ever as accurate as the base's position. Three: 'off' and 'nothing' are customer words, and they have to be pinned down before they mean anything. Four: a uniform shift means a datum problem or a base position problem, and it is fixed by re-referencing rather than re-collecting.",
        "Almost every case that arrives is one of these four wearing a costume."
      ],
      keys: [
        "Base and rover must match.",
        "The rover is only as accurate as the base position.",
        "'Off' and 'nothing' are customer words - pin them down.",
        "A uniform shift is re-referenced, not re-collected."
      ],
      links: [
        { label: "Technical support forum", url: "https://community.sparkpnt.com", kind: "tool" }
      ],
      check: { q: "Recite the four ideas.", a: "Base and rover must match; the rover is only as accurate as the base position; 'off' and 'nothing' are customer words; a uniform shift means datum or base position." }
    },
    {
      id: "triage",
      title: "House style and the triage trio",
      body: [
        "Acknowledge the problem and restate the setup as you understand it, so the customer knows you were listening and so you catch your own misreading early. Then ask the triage trio: device model, firmware version, correction source.",
        "Give the single most likely fix first rather than a list of six. Link the specific documentation page, not the documentation site. Close the loop before the case ends.",
        "And never bluff. 'I need to check with engineering and come back to you' is a completely acceptable answer, and it is far better than a confident wrong one that costs a customer a day in the field."
      ],
      keys: [
        "Restate the setup before diagnosing.",
        "Triage trio: model, firmware, correction source.",
        "One most-likely fix first, with a specific documentation link.",
        "Never bluff."
      ],
      links: [
        { label: "RTK Everywhere manual", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/", kind: "doc" }
      ],
      check: { q: "What is the triage trio?", a: "Device model, firmware version, correction source." }
    },
    {
      id: "ladder",
      title: "Case ladder: connected but never Fix",
      body: [
        "The most common case in the book. Work it in this order and stop when it resolves.",
        "First, sky view: are they indoors, or under canopy, or beside a building? Second, baseline distance: past 35 km, Float is the expected result. Third, the RTCM message flavour: the LG290P accepts MSM3 through MSM7, and older legacy message types (1001-1012) fail silently. Fourth, the GGA upload toggle, which VRS mountpoints require. Fifth, stale credentials or a dead mountpoint. Sixth, and only then, a factory reset.",
        "Notice that the first two rungs cost nothing and resolve a large share of cases."
      ],
      keys: [
        "Sky view, baseline distance, RTCM flavour, GGA toggle, credentials, factory reset.",
        "MSM3 to MSM7 for the LG290P. Older legacy types (1001-1012) fail silently.",
        "Work the ladder in order. Do not start at the reset."
      ],
      links: [],
      figure: "<svg viewBox=\"0 0 480 200\" role=\"img\" aria-label=\"Troubleshooting order for a rover that will not fix\"><text x=\"0\" y=\"12\" font-size=\"11\" fill=\"#8A8F98\">work down in order, and stop when it fixes. The first two cost nothing.</text><circle cx=\"12\" cy=\"33\" r=\"9\" fill=\"#4D7C0F\"/><text x=\"12\" y=\"37\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">1</text><text x=\"30\" y=\"37\" font-size=\"11.5\" fill=\"#171717\">Sky view: indoors, under canopy, beside a wall?</text><line x1=\"12\" y1=\"42\" x2=\"12\" y2=\"51\" stroke=\"#D7DBE0\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"60\" r=\"9\" fill=\"#4D7C0F\"/><text x=\"12\" y=\"64\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">2</text><text x=\"30\" y=\"64\" font-size=\"11.5\" fill=\"#171717\">Baseline: past 35 km, Float is expected</text><line x1=\"12\" y1=\"69\" x2=\"12\" y2=\"78\" stroke=\"#D7DBE0\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"87\" r=\"9\" fill=\"#0F4269\"/><text x=\"12\" y=\"91\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">3</text><text x=\"30\" y=\"91\" font-size=\"11.5\" fill=\"#171717\">RTCM flavour: the LG290P needs MSM (MSM3 to MSM7)</text><line x1=\"12\" y1=\"96\" x2=\"12\" y2=\"105\" stroke=\"#D7DBE0\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"114\" r=\"9\" fill=\"#0F4269\"/><text x=\"12\" y=\"118\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">4</text><text x=\"30\" y=\"118\" font-size=\"11.5\" fill=\"#171717\">GGA upload: VRS mountpoints need your position</text><line x1=\"12\" y1=\"123\" x2=\"12\" y2=\"132\" stroke=\"#D7DBE0\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"141\" r=\"9\" fill=\"#0F4269\"/><text x=\"12\" y=\"145\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">5</text><text x=\"30\" y=\"145\" font-size=\"11.5\" fill=\"#171717\">Credentials and mountpoint health</text><line x1=\"12\" y1=\"150\" x2=\"12\" y2=\"159\" stroke=\"#D7DBE0\" stroke-width=\"2\"/><circle cx=\"12\" cy=\"168\" r=\"9\" fill=\"#E0311D\"/><text x=\"12\" y=\"172\" text-anchor=\"middle\" font-size=\"10\" fill=\"#fff\">6</text><text x=\"30\" y=\"172\" font-size=\"11.5\" fill=\"#171717\">Factory reset, and only now</text></svg>",
      check: { q: "NTRIP is connected, bytes are flowing, the status stays Float. Walk the ladder.", a: "Sky view, then baseline distance, then RTCM message flavour, then the GGA upload toggle, then credentials and mountpoint health, then a factory reset." }
    },
    {
      id: "two-clients",
      title: "When two things are fighting each other",
      body: [
        "A whole family of cases comes from two things doing the same job at once, and they look like hardware faults until you know the pattern.",
        "Two NTRIP clients. One running in the phone app and one running in the receiver produces corrections arriving twice, settings that appear to change themselves, and a connection that will not settle. Only one should ever be running, and for phone-based workflows the app-side client is the one the quick starts teach.",
        "One account, two devices. Many casters allow a single concurrent login. A second device signing in with the same credentials boots the first, which then reconnects and boots the second, and the customer describes a receiver that connects and drops every few seconds forever. Ask how many devices are using that login before touching anything on the receiver.",
        "And when a base and rover pair misbehaves, debug them separately. Confirm the base is healthy first: is it actually in base mode, did the survey-in complete, is its RTCM output counter incrementing? A rover cannot be diagnosed while the thing feeding it is an unknown."
      ],
      keys: [
        "One NTRIP client only. App-side for phone workflows.",
        "Most casters allow one concurrent login: two devices on one account boot each other in a loop.",
        "Prove the base is healthy before you touch the rover.",
        "Re-enter NTRIP settings after any firmware update, which can reset them."
      ],
      links: [
        { label: "RTK Everywhere manual", url: "https://docs.sparkfun.com/SparkFun_RTK_Everywhere_Firmware/", kind: "doc" }
      ],
      check: { q: "A receiver connects and disconnects every few seconds, all day. What do you ask first?", a: "How many devices are logged into that correction account. Most casters allow one, and a second device boots the first in a loop." }
    },
    {
      id: "ghost",
      title: "The ghost corrections case",
      body: [
        "A rover sits in Float or DGPS with corrections apparently arriving. The customer powers the base off and the corrections keep coming. That is the tell: something else is feeding the rover, and it is usually a built-in NTRIP client left enabled from bench testing, pointed at a public caster.",
        "There was a second layer of damage in the real case: joining a WiFi network had also dragged the radio channel off its default, so even after the ghost was found the base and rover no longer matched.",
        "The diagnostic tool is the corrections priorities screen in the serial configuration. It lists every source and when each was last seen. A blank 'last seen' means that source has never delivered a packet."
      ],
      steps: [
        { do: "Confirm the symptom precisely.", why: "'Corrections are arriving' is a customer word. Ask what the correction status actually reads and what the age of differential shows." },
        { do: "Power the base off. Watch the rover.", why: "This is the whole test. Corrections from the base must stop when the base stops. Anything still arriving is coming from somewhere else." },
        { do: "Open the corrections priorities screen in the serial configuration.", why: "It lists every source the receiver will accept and when each was last seen. A source with a recent timestamp that you did not configure is your answer." },
        { do: "Look for a built-in NTRIP client with a caster address in it.", why: "Bench testing leaves these behind. RTK2go mountpoints are the usual find, because they are free and get used for test setups." },
        { do: "Disable it, save, reboot, and re-check the priorities screen.", why: "A save without a reboot leaves the old client running in memory, and you will conclude wrongly that the fix did not work." },
        { do: "Now re-check the radio channel on both units.", why: "In the real case the customer had joined a WiFi network earlier, which had moved the radio channel off default. The ghost was hiding a second, ordinary fault underneath it." }
      ],
      keys: [
        "Corrections that survive powering off the base come from somewhere else.",
        "A leftover NTRIP client from testing is the usual culprit.",
        "The corrections priorities screen is the truth meter.",
        "Fix, save, reboot, and re-check the radio channel."
      ],
      links: [],
      check: { q: "What single test exposes a ghost correction source?", a: "Power the base off. If corrections keep arriving, they were never coming from the base." }
    },
    {
      id: "misc-cases",
      title: "Worked yesterday, MFi, and RMA",
      body: [
        "'It worked yesterday and it is dead today' means something changed, and 'nothing changed' is a belief rather than a fact. The usual suspects in order: the base battery died overnight so it lost its Survey-In and started a new one this morning; a firmware update reset settings; or today's location simply has worse sky or no cell.",
        "On iOS, Apple requires MFi certification for serial connections. Current hardware is certified, so an iOS problem is usually the pairing profile, the app's Bluetooth permission, or a pre-MFi legacy unit from the Surveyor or Express era. It is also a sales point, because MFi plus ArcGIS Field Maps on iOS is the way into Esri shops.",
        "Returns currently run on SparkFun's process: verify the purchase and warranty, which is one year and is not voided by an FP module swap, do the basic triage, raise the RMA, log it in the repair log, then handle shipping. A dedicated process is on the roadmap."
      ],
      keys: [
        "Something always changed. Battery, firmware update, or a different location.",
        "Current hardware is MFi certified; suspect pairing, permissions, or a legacy unit.",
        "Warranty is one year and a module swap does not void it."
      ],
      links: [],
      check: { q: "A customer insists nothing changed since yesterday. What are the three usual suspects?", a: "The base battery died overnight and restarted its Survey-In, a firmware update reset settings, or today's site has worse sky view or no cell." }
    }
  ],
  exam: [
    { type: "mc", q: "A rover will not Fix. Which rung do you check FIRST?",
      options: ["Factory reset the receiver to clear bad settings", "Sky view, then distance to the base", "Update to the latest firmware version", "Replace the antenna or its cable"],
      answer: 1,
      why: "Sky view and baseline distance cost nothing, take seconds, and account for a large share of these cases. The reset is the last rung, not the first." },
    { type: "mc", q: "Corrections keep arriving after the base is powered off. What does that prove?",
      options: ["The base has an internal backup battery", "Another correction source is feeding the rover", "The rover is replaying cached corrections", "The radio link has failed in one direction"],
      answer: 1,
      why: "It is the definitive test for a ghost source, usually a leftover NTRIP client from bench testing pointed at a public caster." },
    { type: "mc", q: "Which of these belongs to the triage trio?",
      options: ["Device model", "Firmware version", "Correction source", "All of the above"],
      answer: 3,
      why: "All three, asked together, before diagnosing. They decide which manual, which menus and which failure modes are even possible." },
    { type: "text", q: "A dataset is uniformly shifted. What do you tell the customer about re-collecting?",
      accept: ["re-refer", "referenc", "shift", "not"],
      answer: "They do not need to re-collect. A uniform shift means a datum mismatch or a wrong base position, and the data can be re-referenced or shifted by the computed offset." },
    { type: "text", q: "What is the correct answer when you do not know something in a support call?",
      accept: ["check", "engineer", "back", "know"],
      answer: "Say you need to check with engineering and come back to them. Never bluff - a confident wrong answer costs the customer a day in the field." }
  ]
}

];


// Every term and acronym the course uses, for the glossary page. Kept here so a
// learner can look one up without hunting for the lesson that introduced it.
const GLOSSARY = [
  ["AIM+", "Septentrio's interference mitigation. Unlike detection-only schemes it actively suppresses jamming. In the FPM."],
  ["Age of differential", "How long ago the last correction arrived. A few seconds is healthy; a climbing number means the link stopped."],
  ["Ambiguity resolution", "Working out the whole number of carrier wavelengths between receiver and satellite. Resolving it is what turns Float into Fix."],
  ["Base", "A receiver that stays still on one spot and sends corrections to a rover."],
  ["BeiDou", "China's global satellite navigation constellation."],
  ["Carrier phase", "A measurement of the signal's own wave rather than the code stamped on it. Far more precise than a pseudorange, but ambiguous by a whole number of wavelengths."],
  ["Caster", "A server that hosts correction streams over NTRIP. Each stream is a mountpoint."],
  ["CEP", "Circular error probable, the radius containing half the measurements. A different statistic from RMS, so the two cannot be compared directly."],
  ["CORS", "Continuously Operating Reference Stations. The permanent recording antennas run by the National Geodetic Survey and partners. Post-processing infrastructure, not a live service."],
  ["CSRS-PPP", "The Canadian post-processing service. Accepts data from anywhere in the world."],
  ["Datum", "The reference frame coordinates are expressed in, such as WGS84 or NAD83. Must be right at collection time."],
  ["DGPS", "Differential GPS. Coarse corrections giving decimeter-level results."],
  ["E6", "A Galileo signal frequency, notable because the free High Accuracy Service is broadcast on it."],
  ["Ellipsoidal height", "Height above the mathematical ellipsoid, which is what a receiver natively outputs. Not the same as height above sea level."],
  ["ESP-NOW", "A 2.4 GHz radio protocol used by the TX2 for base to rover corrections, good for roughly 250 m line of sight."],
  ["Fix (RTK Fix)", "The ambiguities are resolved and the solution is centimeter-level. The green dot."],
  ["Float (RTK Float)", "Corrections are arriving but the ambiguities are not resolved yet. Decimeter-level and still working."],
  ["Galileo", "The European Union's global satellite navigation constellation."],
  ["GGA", "The NMEA sentence carrying a receiver's position. VRS mountpoints need it uploaded before they will send corrections back."],
  ["GLONASS", "Russia's global satellite navigation constellation."],
  ["GNSS", "Global Navigation Satellite System. The umbrella term covering GPS, Galileo, GLONASS and BeiDou."],
  ["GPS", "The United States constellation. One GNSS among four, not a synonym for all of them."],
  ["HAS", "Galileo's High Accuracy Service. Free corrections on E6, 20 cm horizontal and 40 cm vertical at 95 percent."],
  ["IMU", "Inertial measurement unit. Senses how far a pole is tilted so the software can work back to the point on the ground."],
  ["Ionosphere", "The charged upper atmosphere. Delays signals by an amount that depends on frequency, which is why multi-band receivers can measure and remove most of it."],
  ["LoRa", "A long-range radio used by the Facet FP units for base to rover corrections. Kilometers with clear line of sight."],
  ["Mountpoint", "One named correction stream on a caster."],
  ["MSM", "Multiple Signal Messages, the modern RTCM 3 message forms. The Quectel LG290P accepts MSM3 through MSM7."],
  ["Multipath", "Signal arriving after bouncing off a building, vehicle or wet foliage. Not removed by a base, because it is local to each antenna."],
  ["NAD83", "The North American datum. Sits roughly 1 to 2 m from WGS84 in the United States."],
  ["NMEA", "The sentence format receivers use to report positions and status to software."],
  ["NTRIP", "Networked Transport of RTCM via Internet Protocol. The standard for moving corrections over the internet."],
  ["OPUS", "Online Positioning User Service. NOAA's free tool that post-processes a static log against nearby CORS stations."],
  ["OPUS-RS", "The rapid static branch of OPUS, used for sessions under two hours. Needs more nearby stations and returns a weaker solution."],
  ["OSNMA", "Galileo Open Service Navigation Message Authentication. Lets a receiver verify a navigation message genuinely came from the satellite. Present on both the FPX and the FPM."],
  ["OSR", "Observation Space Representation. Corrections as real observations from a real station or network. Classic RTK."],
  ["PPK", "Post-processed kinematic. The same mathematics as RTK, run afterwards against logged data."],
  ["PPP", "Precise point positioning. One receiver plus a global model of satellite errors, converging over minutes with no base."],
  ["PPS", "Pulse per second. The once-per-second timing signal that timing equipment disciplines itself to."],
  ["ppm", "Parts per million. Describes how error grows with distance from the base: 1 ppm adds 1 mm per kilometer."],
  ["Pseudorange", "The distance to a satellite measured from signal travel time, before the receiver clock error and atmospheric delays are removed."],
  ["RINEX", "Receiver Independent Exchange format. The plain-text standard that lets data from any receiver be processed by any software."],
  ["RMS", "Root mean square, roughly the 68 percent figure. A different statistic from CEP."],
  ["Rover", "The receiver you carry, whose position you actually want."],
  ["RTCM", "The Radio Technical Commission for Maritime Services, whose message standard is the format corrections travel in."],
  ["RTK", "Real-Time Kinematic. Using a base to get a rover to centimeter accuracy live in the field."],
  ["RTK2go", "A free volunteer NTRIP caster. No service guarantee, and a common source of leftover test configurations."],
  ["SBAS", "Satellite-based augmentation, called WAAS in North America. Free, built in, roughly a meter."],
  ["SPARTN", "The compact correction format PointPerfect broadcasts in. Decoded natively by the FPX."],
  ["SSR", "State Space Representation. A broadcast model of the error sources rather than station observations. Continental coverage, converges over seconds to minutes."],
  ["Survey-In", "A base averaging its own position to establish where it is. Quick, self-consistent, and only good to roughly 0.5 to 2 m in absolute terms."],
  ["Trilateration", "Finding a position from distances to several known points. Three distances give a position; a fourth solves the receiver's clock."],
  ["Troposphere", "The lower atmosphere. Delays signals regardless of frequency, so it cannot be removed the way ionospheric delay can."],
  ["VRS", "Virtual reference station. A network builds a synthetic base at your location, which is why it needs your position uploaded first."],
  ["WGS84", "The global datum GPS works in. Roughly 1 to 2 m from NAD83 in the United States."]
];
