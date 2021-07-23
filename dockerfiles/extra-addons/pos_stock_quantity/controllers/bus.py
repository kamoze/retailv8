# -*- coding: utf-8 -*-

from openerp.http import request
from openerp.addons.bus.bus import Controller


class BusControllerInherit(Controller):
    def _poll(self, dbname, channels, last, options):
        if request.session.uid:
            channels = list(channels)
            channels.append((request.db, 'pos.stock.channel'))
        return super(BusControllerInherit, self)._poll(dbname, channels, last, options)