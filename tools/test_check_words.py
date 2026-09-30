import unittest
from check_words import check_words

def w(i, ru, **kw):
    base = {"id": f"base-{i:04d}", "ru": ru, "fr": ["x"], "type": "adverbe", "source": "base"}
    base.update(kw)
    return base

class CheckWordsTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(check_words([w(1, "молоко́", type="nom", genre="n"), w(2, "ёлка", type="nom", genre="f"),
                                      w(3, "дом", type="nom", genre="m"), w(4, "до свида́ния", type="autre")]), [])
    def test_duplicate_id(self):
        self.assertTrue(check_words([w(1, "да"), w(1, "нет")]))
    def test_duplicate_ru_ignoring_stress(self):
        self.assertTrue(check_words([w(1, "мо́локо"), w(2, "молоко́")]))
    def test_missing_stress(self):
        self.assertTrue(check_words([w(1, "молоко")]))
    def test_two_stresses(self):
        self.assertTrue(check_words([w(1, "мо́локо́")]))
    def test_stress_on_single_vowel_word(self):
        self.assertTrue(check_words([w(1, "до́м")]))
    def test_stress_on_yo_word(self):
        self.assertTrue(check_words([w(1, "ёлка́")]))
    def test_noun_needs_genre(self):
        self.assertTrue(check_words([w(1, "дом", type="nom")]))
    def test_verb_has_no_genre(self):
        self.assertTrue(check_words([w(1, "знать", type="verbe", genre="m")]))
    def test_bad_type_and_empty_fr(self):
        self.assertTrue(check_words([w(1, "да", type="truc")]))
        self.assertTrue(check_words([w(1, "да", fr=[])]))
    def test_bad_id(self):
        self.assertTrue(check_words([{**w(1, "да"), "id": "mot-1"}]))

if __name__ == "__main__":
    unittest.main()
