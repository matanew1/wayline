package org.birkir.carplay.parser

import androidx.car.app.CarContext
import androidx.car.app.model.PlaceListMapTemplate
import androidx.car.app.model.Template
import androidx.car.app.navigation.model.MapController
import androidx.car.app.navigation.model.MapTemplate
import androidx.car.app.navigation.model.MapWithContentTemplate
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.PanModeListener
import androidx.car.app.navigation.model.PlaceListNavigationTemplate
import androidx.car.app.navigation.model.RoutePreviewNavigationTemplate
import com.facebook.react.bridge.ReadableMap
import org.birkir.carplay.screens.CarScreenContext

class RCTMapTemplate(
  context: CarContext,
  carScreenContext: CarScreenContext
) : RCTTemplate(context, carScreenContext) {

  override fun parse(props: ReadableMap): Template {
    val type = props.getString("type")
    val actionStrip = props.getArray("actions")?.let {
      parseActionStrip(it)
    }
    val header = props.getMap("header")?.let {
      parseHeader(it)
    }
    val headerAction = props.getMap("headerAction")?.let {
      Parser.parseAction(it, context, eventEmitter)
    }
    val pane = props.getMap("pane")?.let {
      parsePane(it)
    }
    val mapActionStrip = props.getArray("mapButtons")?.let {
      parseActionStrip(it)
    }
    val panModeListener = PanModeListener { isInPanMode ->
      if (isInPanMode) {
        eventEmitter.didShowPanningInterface()
      } else {
        eventEmitter.didDismissPanningInterface()
      }
    }
    val mapController = MapController.Builder().apply {
      mapActionStrip?.let { setMapActionStrip(it) }
      setPanModeListener(panModeListener)
    }.build()
    when (type) {
      "navigation" -> {
        return NavigationTemplate.Builder().apply {
          actionStrip?.let { setActionStrip(it) }
          props.getString("backgroundColor")?.let {
            setBackgroundColor(Parser.parseColor(it))
          }
          props.getMap("travelEstimate")?.let {
            setDestinationTravelEstimate(Parser.parseTravelEstimate(it))
          }
          props.getMap("navigationInfo")?.let {
            setNavigationInfo(parseNavigationInfo(it))
          }
          mapActionStrip?.let { setMapActionStrip(it) }
          setPanModeListener(panModeListener)
        }.build()
      }

      "place-list-map" -> {
        return PlaceListMapTemplate.Builder().apply {
          actionStrip?.let { setActionStrip(it) }
          props.getMap("anchor")?.let { setAnchor(parsePlace(it)) }
          if (props.hasKey("currentLocationEnabled")) {
            setCurrentLocationEnabled(props.getBoolean("currentLocationEnabled"))
          }
          headerAction?.let { setHeaderAction(it) }
          props.getArray("items")?.let {
            setItemList(parseItemList(it, ItemListType.PlaceListNavigation))
          }
          setLoading(props.isLoading())
          setOnContentRefreshListener {
            // @todo eventEmitter?.contentDidRefresh
          }
          props.getString("title")?.let { setTitle(it) }
        }.build()
      }

      "place-list-navigation" -> {
        return PlaceListNavigationTemplate.Builder().apply {
          actionStrip?.let { setActionStrip(it) }
          header?.let { setHeader(it) }
          props.getArray("items")?.let {
            setItemList(parseItemList(it, ItemListType.PlaceListNavigation))
          }
          setLoading(props.isLoading())
          mapActionStrip?.let { setActionStrip(it) }
          setOnContentRefreshListener {
            // @todo eventEmitter?.contentDidRefresh
          }
          setPanModeListener(panModeListener)
        }.build()
      }

      "route-preview" -> {
        return RoutePreviewNavigationTemplate.Builder().apply {
          actionStrip?.let { setActionStrip(it) }
          header?.let { setHeader(it) }
          headerAction?.let { setHeaderAction(headerAction) }
          props.getArray("items")?.let {
            setItemList(parseItemList(it, ItemListType.RouteList))
          }
          setLoading(props.isLoading())
          mapActionStrip?.let { setMapActionStrip(it) }
          props.getMap("navigateAction")?.let { setNavigateAction(Parser.parseAction(it, context, eventEmitter)) }
          setPanModeListener(panModeListener)
        }.build()
      }

      "map-with-list" -> {
        return MapWithContentTemplate.Builder().apply {
          setMapController(mapController)
          setContentTemplate(RCTListTemplate(context, carScreenContext).parse(props))
        }.build()
      }

      "map-with-pane" -> {
        return MapWithContentTemplate.Builder().apply {
          setMapController(mapController)
          setContentTemplate(RCTPaneTemplate(context, carScreenContext).parse(props))
        }.build()
      }

      "map-with-grid" -> {
        return MapWithContentTemplate.Builder().apply {
          setMapController(mapController)
          setContentTemplate(RCTGridTemplate(context, carScreenContext, true).parse(props))
        }.build()
      }

      else -> {
        return MapTemplate.Builder().apply {
          header?.let { setHeader(it) }
          props.getArray("items")?.let {
            setItemList(parseItemList(it))
          }
          actionStrip?.let { setActionStrip(it) }
          setMapController(mapController)
          pane?.let { setPane(it) }
        }.build()
      }
    }
  }

  companion object {
    const val TAG = "RCTMapTemplate"
  }
}
