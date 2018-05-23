#!/bin/sh

EXTENSION_NAME="how-did-i-get-here@rugk.github.io"

mkdir -p "build"

# license should be in add-on
mv LICENSE.md src/LICENSE.md

# create XPI
cd src || exit
zip -r -FS "../build/$EXTENSION_NAME.xpi" ./*

mv LICENSE.md ../LICENSE.md
cd ..
