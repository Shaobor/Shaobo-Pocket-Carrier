# -*- coding: utf-8 -*-
"""中国联通「刷新详单流水」按钮 (`button.<手机号>_button`)

联通详单无需二次认证: 轮询只刷新话费与流量，详单展示本地缓存；「自动获取通话记录」开启时
每天在设定时间拉取一次通话/短信/上网三类详单，需要时也可按本按钮立即手动拉取一次。
实体 ID 与电信「通话详单二次认证」按钮相同，前端卡片按同一个实体 ID 调用。
"""
import logging
import time
from typing import Any, Dict

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from ..const import ENTITY_DETAIL_REFRESH_BUTTON
from .auto_query import parse_auto_query_time
from .base import CarrierControlEntity

_LOGGER = logging.getLogger(__name__)


class UnicomDetailRefreshButton(CarrierControlEntity, ButtonEntity):
    """刷新详单流水 (立即拉取一次三类详单，不受「自动获取通话记录」开关限制)"""

    _attr_device_class = ButtonDeviceClass.UPDATE

    def __init__(self, hass: HomeAssistant, coordinator, phone: str, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            coordinator,
            phone,
            entry,
            ENTITY_DETAIL_REFRESH_BUTTON,
            "刷新详单流水",
            "mdi:refresh",
            platform_domain="button",
        )

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        runtime = self._runtime
        hour, minute = parse_auto_query_time(runtime.auto_query_time)
        return {
            "最近执行时间": runtime.last_run_at or "尚未执行",
            "最近执行结果": runtime.last_result,
            "自动获取通话记录": (
                f"已开启（每天 {hour:02d}:{minute:02d} 拉取一次详单）"
                if runtime.auto_query_enabled
                else "已关闭（不再定时拉取详单，展示本地缓存）"
            ),
            "使用说明": (
                "按下立即按「通话详单查询起始日期」所在月份拉取一次通话、短信、上网详单，"
                "不受「自动获取通话记录」开关限制"
            ),
        }

    async def async_press(self) -> None:
        runtime = self._runtime
        if runtime.busy:
            runtime.last_result = "正在执行其它操作，请稍后再按"
            runtime.notify()
            return

        runtime.busy = True
        self._async_safe_write_state()
        try:
            ok = await self._coordinator.async_refresh_details()
            runtime.last_result = (
                "已拉取最新详单流水" if ok else "拉取失败，请检查网络或登录状态后重试"
            )
        except Exception as err:
            runtime.last_result = f"执行异常：{err}"
            _LOGGER.warning("联通手机号 %s 刷新详单流水异常: %s", self.phone, err)
        finally:
            runtime.busy = False
            runtime.last_run_at = time.strftime("%Y-%m-%d %H:%M:%S")
            runtime.notify()


def create_detail_refresh_button(
    hass: HomeAssistant,
    coordinator,
    phone: str,
    entry: ConfigEntry,
) -> UnicomDetailRefreshButton:
    """创建联通「刷新详单流水」按钮实体 (button 平台)"""
    return UnicomDetailRefreshButton(hass, coordinator, phone, entry)
