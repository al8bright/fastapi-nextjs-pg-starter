"""설정/시각대 테스트 (architecture.md §5, §10)."""
import logging
import os
import time

from app import config


def test_local_utc_offset_hours_reports_kst(monkeypatch):
    monkeypatch.setattr(time, "daylight", 0)
    monkeypatch.setattr(time, "timezone", -9 * 3600)
    assert config.local_utc_offset_hours() == config.KST_UTC_OFFSET_HOURS


def test_local_utc_offset_hours_reports_non_kst(monkeypatch):
    monkeypatch.setattr(time, "daylight", 0)
    monkeypatch.setattr(time, "timezone", 0)
    assert config.local_utc_offset_hours() == 0


def test_local_utc_offset_hours_uses_altzone_during_dst(monkeypatch):
    monkeypatch.setattr(time, "daylight", 1)
    monkeypatch.setattr(time, "timezone", 5 * 3600)
    monkeypatch.setattr(time, "altzone", 4 * 3600)
    assert config.local_utc_offset_hours() == -4


def test_apply_timezone_overwrites_preexisting_tz(monkeypatch):
    # .env 의 TZ 가 셸 환경변수보다 우선해야 한다 (§5 셸 환경변수 의존 금지) — setdefault 가 아니다.
    monkeypatch.setenv("TZ", "America/New_York")
    monkeypatch.delattr(time, "tzset", raising=False)
    monkeypatch.setattr(time, "daylight", 0)
    monkeypatch.setattr(time, "timezone", -9 * 3600)
    config._apply_timezone("Asia/Seoul")
    assert os.environ["TZ"] == "Asia/Seoul"


def test_apply_timezone_warns_when_os_offset_is_not_kst(monkeypatch, caplog):
    # Windows 는 TZ 환경변수로 프로세스 시각대를 바꿀 수 없다(tzset 부재 + MSVC CRT 가 IANA 이름
    # 미해석). 강제할 수 없으므로 최소한 조용히 넘어가지 않고 경고해야 한다.
    monkeypatch.delattr(time, "tzset", raising=False)
    monkeypatch.setattr(time, "daylight", 0)
    monkeypatch.setattr(time, "timezone", 0)  # UTC
    with caplog.at_level(logging.WARNING, logger=config.__name__):
        config._apply_timezone("Asia/Seoul")
    assert any("UTC+0" in record.getMessage() for record in caplog.records)


def test_apply_timezone_silent_when_os_offset_is_kst(monkeypatch, caplog):
    monkeypatch.delattr(time, "tzset", raising=False)
    monkeypatch.setattr(time, "daylight", 0)
    monkeypatch.setattr(time, "timezone", -9 * 3600)
    with caplog.at_level(logging.WARNING, logger=config.__name__):
        config._apply_timezone("Asia/Seoul")
    assert caplog.records == []
