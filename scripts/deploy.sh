#!/bin/sh
# Build the site and publish it to GitHub Pages by pushing the built files
# to the gh-pages branch. Run from the project folder: npm run deploy
set -e
npm run build
out=$(mktemp -d)
cp -R dist/. "$out"/
touch "$out/.nojekyll"
remote=$(git remote get-url origin)
name=$(git config user.name)
email=$(git config user.email)
cd "$out"
git init -q -b gh-pages
git config user.name "$name"
git config user.email "$email"
git add -A
git commit -q -m "Publish the built site"
git push -q -f "$remote" gh-pages
rm -rf "$out"
echo "Published. The site updates in about a minute."
