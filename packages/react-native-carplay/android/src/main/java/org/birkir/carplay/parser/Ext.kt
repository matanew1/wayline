package org.birkir.carplay.parser

import com.facebook.react.bridge.ReadableMap

fun ReadableMap.isLoading(): Boolean {
  return try {
    getBoolean("loading")
  } catch (e: Exception) {
    return false
  }
}

enum class ItemListType(val value: Int) {
  Row(1),
  Grid(2),
  PlaceListNavigation(3),
  RouteList(4)
}