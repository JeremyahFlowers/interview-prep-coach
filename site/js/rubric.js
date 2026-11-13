// The five things a mock interview is actually assessing.
//
// Its own module, tiny, because two pages need it and only one of them may
// import the domain layer: the interviewer's page holds no store, no token and
// no practice log, and the way that stays true is by it importing almost
// nothing.
//
// These are behaviours rather than outcomes on purpose. Whether you solved it
// is already on the attempt; these are the part that only happens when somebody
// is watching, and until an interviewer could tick them they were self-reported
// by the person being assessed, about themselves, after the fact.
export const MOCK_CHECKLIST = [
  "Clarified constraints & edge cases before coding",
  "Stated approach out loud before typing",
  "Narrated trade-offs while coding",
  "Stated time/space complexity unprompted",
  "Tested with an example before declaring done",
];
