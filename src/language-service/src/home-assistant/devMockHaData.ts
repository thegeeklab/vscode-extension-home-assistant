import { CompletionItem, CompletionItemKind, MarkupContent } from "vscode-languageserver-protocol"
import type { HassEntities, HassServices } from "home-assistant-js-websocket"
import type { HassDevices } from "./haConnection.js"

/**
 * Static registry data for Extension Development Host testing without a live
 * Home Assistant instance. IDs align with test-workspace validation fixtures
 * and the *-validation-mock.test.ts suites.
 */

function completion(
  label: string,
  detail: string,
  kind: CompletionItemKind,
  data: Record<string, unknown>,
  docs: string
): CompletionItem {
  return {
    label,
    detail,
    kind,
    data,
    documentation: { kind: "markdown", value: docs } as MarkupContent
  }
}

export const DEV_MOCK_AREAS: CompletionItem[] = [
  completion(
    "living_room",
    "Living Room",
    CompletionItemKind.Variable,
    { isArea: true },
    "**living_room**\n\nFloor: ground_floor\n\n"
  ),
  completion(
    "kitchen",
    "Kitchen",
    CompletionItemKind.Variable,
    { isArea: true },
    "**kitchen**\n\nFloor: ground_floor\n\n"
  ),
  completion(
    "bedroom",
    "Bedroom",
    CompletionItemKind.Variable,
    { isArea: true },
    "**bedroom**\n\nFloor: first_floor\n\n"
  )
]

export const DEV_MOCK_DEVICES: CompletionItem[] = [
  completion(
    "device_1234",
    "Smart Light Device",
    CompletionItemKind.Variable,
    { isDevice: true },
    "**device_1234**\n\nName: Smart Light Device\n\nArea: living_room\n\n"
  ),
  completion(
    "device_5678",
    "Motion Sensor",
    CompletionItemKind.Variable,
    { isDevice: true },
    "**device_5678**\n\nName: Motion Sensor\n\nArea: kitchen\n\n"
  ),
  completion(
    "device_9999",
    "Smart Thermostat",
    CompletionItemKind.Variable,
    { isDevice: true },
    "**device_9999**\n\nName: Smart Thermostat\n\nArea: bedroom\n\n"
  )
]

export const DEV_MOCK_FLOORS: CompletionItem[] = [
  completion(
    "ground_floor",
    "Ground Floor",
    CompletionItemKind.Variable,
    { isFloor: true },
    "**ground_floor**\n\nName: Ground Floor\n\n"
  ),
  completion(
    "first_floor",
    "First Floor",
    CompletionItemKind.Variable,
    { isFloor: true },
    "**first_floor**\n\nName: First Floor\n\n"
  ),
  completion(
    "basement",
    "Basement",
    CompletionItemKind.Variable,
    { isFloor: true },
    "**basement**\n\nName: Basement\n\n"
  )
]

export const DEV_MOCK_LABELS: CompletionItem[] = [
  completion(
    "security",
    "Security",
    CompletionItemKind.Variable,
    { isLabel: true },
    "**security**\n\nSecurity related devices and entities\n\n"
  ),
  completion(
    "automation",
    "Automation",
    CompletionItemKind.Variable,
    { isLabel: true },
    "**automation**\n\nAutomation related devices\n\n"
  ),
  completion(
    "lighting",
    "Lighting",
    CompletionItemKind.Variable,
    { isLabel: true },
    "**lighting**\n\nLighting fixtures and controls\n\n"
  )
]

export const DEV_MOCK_SERVICES: HassServices = {
  light: {
    turn_on: {
      name: "Turn on",
      description: "Turn on one or more lights",
      fields: {},
      target: {}
    },
    turn_off: {
      name: "Turn off",
      description: "Turn off one or more lights",
      fields: {},
      target: {}
    },
    toggle: { name: "Toggle", description: "Toggle one or more lights", fields: {}, target: {} }
  },
  switch: {
    turn_on: { name: "Turn on", description: "Turn on switch", fields: {}, target: {} },
    turn_off: { name: "Turn off", description: "Turn off switch", fields: {}, target: {} }
  },
  homeassistant: {
    turn_off: {
      name: "Generic turn off",
      description: "Generic service to turn off devices",
      fields: {},
      target: {}
    },
    turn_on: {
      name: "Generic turn on",
      description: "Generic service to turn on devices",
      fields: {},
      target: {}
    },
    restart: { name: "Restart", description: "Restart Home Assistant", fields: {}, target: {} }
  },
  notify: {
    notify: { name: "Notify", description: "Send a notification", fields: {}, target: {} }
  },
  climate: {
    set_temperature: {
      name: "Set temperature",
      description: "Set target temperature",
      fields: {},
      target: {}
    }
  },
  media_player: {
    media_play: { name: "Play", description: "Start playing media", fields: {}, target: {} }
  }
}

function entity(entityId: string, friendlyName: string, state = "off"): HassEntities[string] {
  return {
    entity_id: entityId,
    state,
    attributes: { friendly_name: friendlyName },
    last_changed: "2023-01-01T00:00:00.000Z",
    last_updated: "2023-01-01T00:00:00.000Z",
    context: { id: "dev-mock", parent_id: null, user_id: null }
  }
}

export const DEV_MOCK_ENTITIES: HassEntities = {
  "light.kitchen": entity("light.kitchen", "Kitchen Light", "off"),
  "light.living_room": entity("light.living_room", "Living Room Light", "on"),
  "binary_sensor.motion": entity("binary_sensor.motion", "Motion Sensor", "off"),
  "switch.outlet": entity("switch.outlet", "Outlet", "off"),
  "media_player.living_room": entity("media_player.living_room", "Living Room Media", "idle"),
  "sensor.temperature": entity("sensor.temperature", "Temperature", "21"),
  "input_boolean.test_enabled": entity("input_boolean.test_enabled", "Test Enabled", "on")
}

export function getDevMockHassDevices(): HassDevices {
  const devices: HassDevices = {}
  for (const item of DEV_MOCK_DEVICES) {
    const id = item.label as string
    devices[id] = {
      id,
      name: item.detail || id,
      name_by_user: null,
      manufacturer: "Dev Mock",
      model: "mock",
      area_id: id === "device_1234" ? "living_room" : id === "device_5678" ? "kitchen" : "bedroom",
      configuration_url: null,
      config_entries: [],
      connections: [],
      disabled_by: null,
      entry_type: null,
      hw_version: null,
      identifiers: [],
      sw_version: null,
      via_device_id: null,
      labels: []
    }
  }
  return devices
}

export function getDevMockServiceCompletions(): CompletionItem[] {
  const items: CompletionItem[] = []
  for (const [domain, services] of Object.entries(DEV_MOCK_SERVICES)) {
    for (const [service, meta] of Object.entries(services)) {
      const label = `${domain}.${service}`
      items.push(
        completion(
          label,
          meta.name || service,
          CompletionItemKind.Function,
          { isService: true },
          `**${meta.name || service}**\n\n${meta.description || ""}\n\n`
        )
      )
    }
  }
  return items
}

export function getDevMockDomainCompletions(): CompletionItem[] {
  const domains = new Set<string>()
  for (const entityId of Object.keys(DEV_MOCK_ENTITIES)) {
    domains.add(entityId.split(".")[0])
  }
  for (const domain of Object.keys(DEV_MOCK_SERVICES)) {
    domains.add(domain)
  }
  return Array.from(domains)
    .sort()
    .map((domain) =>
      completion(
        domain,
        domain,
        CompletionItemKind.Module,
        { isDomain: true },
        `**${domain}**\n\n`
      )
    )
}

export function getDevMockEntityCompletions(): CompletionItem[] {
  return Object.values(DEV_MOCK_ENTITIES).map((e) =>
    completion(
      e.entity_id,
      (e.attributes as { friendly_name?: string }).friendly_name || e.entity_id,
      CompletionItemKind.Variable,
      { isEntity: true },
      `**${e.entity_id}**\n\nState: ${e.state}\n\n`
    )
  )
}
