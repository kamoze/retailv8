# -*- coding: utf-8 -*-
#/#############################################################################
#
#    Span Tree
#    Copyright (C) 2004-TODAY Span Tree(<http://www.spantreeng.com/>).
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU Affero General Public License as
#    published by the Free Software Foundation, either version 3 of the
#    License, or (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU Affero General Public License for more details.
#
#    You should have received a copy of the GNU Affero General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#/#############################################################################

{
    'name': 'Report Intimation',
    'version': '1.0',
    'category': 'report',
    "sequence": 3,
    'description': """
    This module provide to Daily / Weekly / Monthly basis reports. and Its send to head of department.
    """,
    'author': 'Span Tree',
    'website': 'http://www.spantreeng.com/',
    'images': [],
    'depends': ['stock', 'sale', 'purchase', 'st_sale_report', 'account_voucher'],
    'update_xml': [],
    'css': [],
    'qweb': [],
    'js': [],        
    'test': [],
    'data':[ 'notification_view_cron.xml',
            'account_invoice_view.xml'
    ],
    'images': [],
    'installable': True,
    'auto_install': False,
    'application': True,
}
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
