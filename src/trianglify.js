/*
 * Trianglify.js
 * by @qrohlf
 *
 * Licensed under the GPLv3
 */

import Delaunator from 'delaunator'
import seedrandom from 'seedrandom'
import chroma from 'chroma-js'
import colorbrewer from '../lib/colorbrewer'
import Pattern from './pattern'
import * as geom from './utils/geom'

const defaultOptions = {
  // Pattern height/width. When rendering via Canvas, this determines the native
  // pixel dimensions of the canvas. When rendering via SVG, this is a unitless
  // value that simply defines the coordinate system and default viewBox.
  // Note that output values are rounded to a single decimal place by default,
  // so SVG coordinate systems that rely on high precision fractions
  // (i.e height: 1, width: 1) will not work well. To work around this, you may
  // set {coordinateRounding: false} in the SVG pattern generator options
  height: 400,
  width: 600,
  cellSize: 75,
  variance: 0.75,
  seed: null,
  xColors: 'random',
  yColors: 'match',
  palette: colorbrewer,
  colorSpace: 'lab',
  stroke_width: 0,
  points: null
}


// This function does the "core" render-independent work:
//
// 1. Parse and munge options
// 2. Setup cell geometry
// 3. Generate random points within cell geometry
// 4. Use the Delaunator library to run the triangulation
// 5. Do color interpolation to establish the fundamental coloring of the shapes
export default function trianglify (_opts) {
  const opts = {...defaultOptions, ..._opts}

  // standard randomizer, used for point gen and layout
  const rand = seedrandom(opts.seed)

  const randomFromPalette = () => {
    if (opts.palette instanceof Array) {
      return opts.palette[Math.floor(rand()*opts.palette.length)]
    }
    const keys = Object.keys(opts.palette);
    return opts.palette[keys[Math.floor(rand()*keys.length)]]
  }

  // The first step here is to set up our color scales for the X and Y axis.
  // First, munge the shortcut options like 'random' or 'match' into real color
  // arrays. Then, set up a Chroma scale in the appropriate color space.
  const processColorOpts = (colorOpt) => {
    switch (true) {
      case Array.isArray(colorOpt):
        return colorOpt
      case opts.palette[colorOpt]:
        return opts.palette[colorOpt]
      case colorOpt === 'random':
        return randomFromPalette()
    }
  }

  const xColors = processColorOpts(opts.xColors)
  const yColors = opts.yColors === 'match'
    ? xColors
    : processColorOpts(opts.yColors)

  console.log(xColors, yColors)

  const xScale = chroma.scale(xColors).mode(opts.colorSpace)
  const yScale = chroma.scale(yColors).mode(opts.colorSpace)

  // Our next step is to generate a pseudo-random grid of {x, y , z} points,
  // (or to simply utilize the points that were passed to us)
  const points = opts.points || getPoints(opts, rand)
  // window.document.body.appendChild(debugRender(opts, points))

  // Once we have the points array, run the triangulation:
  var geomIndices = Delaunator.from(points).triangles

  // And generate geometry and color data:

  // use a different randomizer for the color function so that swapping
  // out color functions, etc, doesn't change the pattern geometry itself
  const colorRand = seedrandom(opts.seed ? opts.seed + 'salt' : undefined)
  const polys = []
  const triangleIndices = []
  for (let i = 0; i < geomIndices.length; i += 3) {
    const vertices = [
      points[geomIndices[i]],
      points[geomIndices[i + 1]],
      points[geomIndices[i + 2]]
    ]

    triangleIndices.push(
      [geomIndices[i], geomIndices[i + 1], geomIndices[i + 2]]
    )

    const {width, height} = opts
    const norm = num => Math.max(0, Math.min(1, num))
    const centroid = geom.getCentroid(vertices)
    const xPercent = norm(centroid.x / width)
    const yPercent = norm(centroid.y / height)
    console.log(xPercent, yPercent)

    const color = chroma.mix(
      xScale(xPercent),
      yScale(yPercent),
      0.5,
      opts.colorSpace
    )

    polys.push({
      vertices,
      centroid,
      color, // chroma color object
      normal: [0, 0, 0] // xyz normal vector
    })
  }

  // return new Pattern(polys, opts)

  const p = new Pattern(polys, opts)
  // hackety hack
  p.rawData = {
    points,
    triangleIndices
  }
  return p
}

const getPoints = (opts, random) => {
  const {width, height, cellSize, variance} = opts

  // pad by 2 cells outside the visible area on each side to ensure we fully
  // cover the 'artboard'
  const colCount = Math.floor(width / cellSize) + 4
  const rowCount = Math.floor(height / cellSize) + 4

  // determine bleed values to ensure that the grid is centered within the
  // artboard
  const bleedX = ((colCount * cellSize) - width) / 2
  const bleedY = ((rowCount * cellSize) - height) / 2

  // apply variance to cellSize to get cellJitter in pixels
  const cellJitter = cellSize * variance
  const getJitter = () => (random() - 0.5) * cellJitter

  const pointCount = colCount * rowCount

  const halfCell = cellSize / 2

  const Z_DEPTH = halfCell * 3

  const points = Array(pointCount).fill(null).map((_, i) => {
    const col = i % colCount
    const row = Math.floor(i / colCount)

    // [x, y, z]
    return [
      -bleedX + col * cellSize + halfCell + getJitter(),
      -bleedY + row * cellSize + halfCell + getJitter(),
      random() * Z_DEPTH
    ]
  })

  return points
}

const debugRender = (opts, points) => {
  const doc = window.document
  const svg = window.document.createElementNS("http://www.w3.org/2000/svg", 'svg')
  svg.setAttribute('width', opts.width + 400)
  svg.setAttribute('height', opts.height + 400)

  points.forEach(p => {
    const circle = doc.createElementNS("http://www.w3.org/2000/svg", 'circle')
    circle.setAttribute('cx', p[0])
    circle.setAttribute('cy', p[1])
    circle.setAttribute('r', 2)
    svg.appendChild(circle)
  })

  const bounds = doc.createElementNS("http://www.w3.org/2000/svg", 'rect')
  bounds.setAttribute('x', 0)
  bounds.setAttribute('y', 0)
  bounds.setAttribute('width', opts.width)
  bounds.setAttribute('height', opts.height)
  bounds.setAttribute('stroke-width', 1)
  bounds.setAttribute('stroke', 'blue')
  bounds.setAttribute('fill', 'none')
  svg.appendChild(bounds)

  svg.setAttribute('viewBox', `-100 -100 ${opts.width + 200} ${opts.height + 200}`)
  return svg
}