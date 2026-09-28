# -*- coding: utf-8 -*-
"""按钮实体平台入口 (通话详单二次认证)

Home Assistant 通过 importlib 加载 <集成目录>/<平台名>.py，因此本文件必须留在根目录；
真正的装配逻辑集中在 platforms/setup.py，此处仅做转发。
"""
from .platforms.setup import async_setup_carrier_buttons as async_setup_entry  # noqa: F401
