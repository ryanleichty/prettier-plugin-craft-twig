import { expect } from 'chai';
import { getTwigSingleQuote } from 'src/utils';
import { transformStringQuotes } from 'src/printer/utils/string';

describe('Module: utils', () => {
  describe('Unit: getTwigSingleQuote', () => {
    it('should return twigSingleQuote', () => {
      expect(getTwigSingleQuote({ twigSingleQuote: true })).to.equal(true);
      expect(getTwigSingleQuote({ twigSingleQuote: false })).to.equal(false);
    });
  });

  describe('Unit: transformStringQuotes', () => {
    describe('when twigSingleQuote is true (prefer single quotes)', () => {
      it('should convert double-quoted strings to single-quoted', () => {
        expect(transformStringQuotes('foo("bar")', true)).to.equal("foo('bar')");
        expect(transformStringQuotes('set x = "hello"', true)).to.equal("set x = 'hello'");
      });

      it('should preserve double quotes when content contains single quotes', () => {
        expect(transformStringQuotes('foo("it\'s")', true)).to.equal('foo("it\'s")');
      });

      it('should preserve double quotes when content contains #{...} interpolation', () => {
        // Twig only evaluates #{...} inside double-quoted strings. Converting
        // to single quotes would turn it into literal characters.
        expect(transformStringQuotes('set id = ":#{user.id}:"', true)).to.equal(
          'set id = ":#{user.id}:"',
        );
        expect(transformStringQuotes('foo("prefix-#{1 + 1}-suffix")', true)).to.equal(
          'foo("prefix-#{1 + 1}-suffix")',
        );
      });

      it('should preserve double quotes when content uses non-trivial escape sequences', () => {
        // \n, \t, \", \r, \f etc. are only interpreted in double-quoted strings.
        expect(transformStringQuotes('foo("line1\\nline2")', true)).to.equal(
          'foo("line1\\nline2")',
        );
        expect(transformStringQuotes('foo("tab\\there")', true)).to.equal('foo("tab\\there")');
        expect(transformStringQuotes('foo("quote\\"here")', true)).to.equal(
          'foo("quote\\"here")',
        );
      });

      it('should still convert when content only uses \\\\ or \\\' escapes', () => {
        // Both single- and double-quoted strings interpret \\ the same way (literal backslash).
        expect(transformStringQuotes('foo("back\\\\slash")', true)).to.equal(
          "foo('back\\\\slash')",
        );
      });

      it('should leave single-quoted strings unchanged', () => {
        expect(transformStringQuotes("foo('bar')", true)).to.equal("foo('bar')");
      });
    });

    describe('when twigSingleQuote is false (prefer double quotes)', () => {
      it('should convert single-quoted strings to double-quoted', () => {
        expect(transformStringQuotes("foo('bar')", false)).to.equal('foo("bar")');
      });

      it('should preserve single quotes when content contains double quotes', () => {
        expect(transformStringQuotes('foo(\'say "hi"\')', false)).to.equal('foo(\'say "hi"\')');
      });

      it('should preserve single quotes when content contains #{...} literal', () => {
        // `#{x}` inside single quotes is literal characters. Converting to
        // double quotes would accidentally enable interpolation.
        expect(transformStringQuotes("foo('literal #{x}')", false)).to.equal(
          "foo('literal #{x}')",
        );
      });

      it('should leave double-quoted strings unchanged', () => {
        expect(transformStringQuotes('foo("bar")', false)).to.equal('foo("bar")');
      });
    });

    it('should handle multiple strings in the same markup', () => {
      expect(transformStringQuotes('foo("a", "b", "c")', true)).to.equal("foo('a', 'b', 'c')");
    });
  });
});
